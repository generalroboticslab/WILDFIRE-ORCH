"""
FastAPI Backend for WILDFIRE Human Interface
Updated to use the actual WILDFIRE script directly instead of separate services
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import time
import threading
import json
import os
import random
import logging
import requests
from datetime import datetime

# Reduce uvicorn access log spam for high-frequency polling endpoints
class _PollFilter(logging.Filter):
    _QUIET = ("/get_chat", "/events", "/phase_status", "/observations/")
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not any(p in msg for p in self._QUIET)

logging.getLogger("uvicorn.access").addFilter(_PollFilter())

# Algorithm service configuration - use host.docker.internal for hybrid setup
ALGORITHM_SERVICE_URL = os.getenv("ALGORITHM_SERVICE_URL", "http://host.docker.internal:8001")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    # On shutdown, tell the algorithm service so it can stop any running games
    try:
        requests.post(f"{ALGORITHM_SERVICE_URL}/shutdown", timeout=5)
    except Exception as e:
        print(f"Error notifying algorithm service of shutdown: {e}")


app = FastAPI(lifespan=lifespan)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development - restrict this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state for lobby management
active_sessions: Dict[str, Dict[str, Any]] = {}
pending_actions: Dict[str, Dict[int, List[int]]] = {}  # lobby_id -> {agent_id -> action}
polling_tasks: Dict[str, threading.Thread] = {}  # lobby_id -> polling thread
player_heartbeats: Dict[str, Dict[str, float]] = {}  # lobby_id -> {player_name -> last_seen timestamp}

# Pydantic models
class CreateLobbyRequest(BaseModel):
    lobby_id: str
    creator_name: str
    level: str
    seed: Optional[int] = None
    roles: Dict[str, List[str]]  # {"agents": [...], "managers": [...]}
    hierarchy: Dict[str, Any]  # {"AGENT_5": {"children": [...], "type": "horizontal", "team_name": "..."}}
    communication_mode: str = "team_chat"
    collaboration_mode: str = "human_feedback"
    # Creator-supplied OpenAI key, used by the WILDFIRE subprocess for this lobby.
    # Optional: not needed when the algorithm service runs a local model or has its own key.
    openai_api_key: Optional[str] = None

class ClaimRoleRequest(BaseModel):
    lobby_id: str
    player_name: str
    role: str

class UnclaimRoleRequest(BaseModel):
    lobby_id: str
    player_name: str

class StartGameRequest(BaseModel):
    lobby_id: str

class SubmitActionRequest(BaseModel):
    lobby_id: str
    player_name: str
    agent_id: int
    action: List[int]  # [action_type, param1, param2]

class SendMessageRequest(BaseModel):
    lobby_id: str
    player_name: str
    chat_id: str
    message: str
    timestamp: Optional[str] = None

    def __init__(self, **data):
        if data.get('timestamp') is None:
            data['timestamp'] = datetime.now().isoformat()
        super().__init__(**data)

class SubmitFeedbackRequest(BaseModel):
    lobby_id: str
    player_name: str
    agent_id: int
    feedback: str
    timestep: int

class SendChatRequest(BaseModel):
    lobby_id: str
    player_name: str
    target_agent_id: int
    content: str
    message_id: str

class StopGameRequest(BaseModel):
    lobby_id: str
    player_name: str

class HeartbeatRequest(BaseModel):
    lobby_id: str
    player_name: str

# Helper functions
_levels_cache: Dict[str, Any] = {}
_levels_cache_time: float = 0.0

def load_levels():
    """Load levels from the algorithm service (single source of truth).
    Caches for 60 seconds to avoid repeated HTTP calls."""
    global _levels_cache, _levels_cache_time
    now = time.time()
    if _levels_cache and (now - _levels_cache_time) < 60:
        return _levels_cache
    try:
        resp = requests.get(f"{ALGORITHM_SERVICE_URL}/levels", timeout=5)
        resp.raise_for_status()
        _levels_cache = resp.json().get("levels", {})
        _levels_cache_time = now
        return _levels_cache
    except Exception as e:
        print(f"Error loading levels from algorithm service: {e}")
        if _levels_cache:
            return _levels_cache
        return {}


_llm_config_cache: Dict[str, Any] = {}
_llm_config_cache_time: float = 0.0
_DEFAULT_LLM_CONFIG: Dict[str, Any] = {"llm_provider": "openai", "llm_model": None, "requires_api_key": True}

def get_llm_config() -> Dict[str, Any]:
    """Ask the algorithm service which language-model provider it runs and whether lobby
    creators must supply their own OpenAI key. Cached for 60 seconds.
    Fails closed (key required) when the service cannot be reached."""
    global _llm_config_cache, _llm_config_cache_time
    now = time.time()
    if _llm_config_cache and (now - _llm_config_cache_time) < 60:
        return _llm_config_cache
    try:
        resp = requests.get(f"{ALGORITHM_SERVICE_URL}/config", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        _llm_config_cache = {
            "llm_provider": "local" if data.get("llm_provider") == "local" else "openai",
            "llm_model": data.get("llm_model"),
            "requires_api_key": bool(data.get("requires_api_key", True)),
        }
        _llm_config_cache_time = now
        return _llm_config_cache
    except Exception as e:
        print(f"Error loading LLM config from algorithm service: {e}")
        if _llm_config_cache:
            return _llm_config_cache
        return dict(_DEFAULT_LLM_CONFIG)


def generate_agent_names(level_key: str, levels: Dict[str, Any]) -> List[str]:
    """Generate agent names based on level configuration in algorithm order"""
    level = levels.get(level_key, {})
    agents = level.get("agents", {})
    
    # Follow algorithm order: firefighters, bulldozers, drones, helicopters
    agent_order = ["firefighters", "bulldozers", "drones", "helicopters"]
    
    agent_names = []
    agent_id = 1
    
    for agent_type in agent_order:
        count = agents.get(agent_type, 0)
        for i in range(count):
            agent_names.append(f"AGENT_{agent_id}")
            agent_id += 1
    
    return agent_names

def generate_manager_names(agent_names: List[str], num_managers: int) -> List[str]:
    """Generate manager names that continue the AGENT_# sequence"""
    next_id = len(agent_names) + 1
    manager_names = []
    
    for i in range(num_managers):
        manager_names.append(f"AGENT_{next_id + i}")
    
    return manager_names

def validate_openai_api_key(api_key: str) -> None:
    """Validate a user-supplied OpenAI API key; raise HTTPException(400) if invalid.

    Never log the key itself. On network errors, let creation proceed so an
    OpenAI/network hiccup doesn't lock users out — a truly bad key will still
    fail loudly when the game starts.
    """
    if not api_key or not api_key.strip():
        raise HTTPException(status_code=400, detail="An OpenAI API key is required to create a lobby")
    api_key = api_key.strip()
    if not api_key.startswith("sk-"):
        raise HTTPException(status_code=400, detail="Invalid OpenAI API key: it should start with 'sk-'")
    try:
        response = requests.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10,
        )
        if response.status_code == 401:
            raise HTTPException(status_code=400, detail="Invalid OpenAI API key: authentication failed")
    except HTTPException:
        raise
    except requests.RequestException:
        print("[CREATE LOBBY] Warning: could not reach OpenAI to validate the API key; proceeding")


def create_lobby_config(request: CreateLobbyRequest, levels: Dict[str, Any]) -> Dict[str, Any]:
    """Create lobby configuration for WILDFIRE script"""
    agent_names = generate_agent_names(request.level, levels)
    manager_names = request.roles.get("managers", [])

    # Convert hierarchy to team_config format expected by algorithm service
    # New format: {"humans": [...], "managers": {4: {"children": [...], "type": "horizontal", "team_name": "..."}}}
    humans = []
    managers = {}

    # Map agent/manager names to indices (1-based)
    # Agents get indices 1, 2, 3, ...
    # Managers get indices starting after agents
    all_agent_names = agent_names + manager_names
    agent_to_index = {name: i+1 for i, name in enumerate(all_agent_names)}

    # Build humans list (initially empty - will be updated when players claim roles)
    humans = []

    # Build managers dict from hierarchy - new format with children, type, team_name
    for manager_name, config in request.hierarchy.items():
        if manager_name in manager_names and manager_name in agent_to_index:
            manager_idx = agent_to_index[manager_name]

            # New format: config is a dict with children, type, team_name
            children_names = config.get("children", [])
            manager_type = config.get("type", "vertical")
            team_name = config.get("team_name", f"TEAM_{manager_idx}")

            child_indices = []
            for child_name in children_names:
                if child_name in agent_to_index:
                    child_indices.append(agent_to_index[child_name])

            if child_indices:
                managers[manager_idx] = {
                    "children": child_indices,
                    "type": manager_type,
                    "team_name": team_name
                }

    # Use provided seed or generate random
    seed_value = request.seed if request.seed is not None else random.randint(1000, 9999)

    print(f"[TEAM CONFIG DEBUG] Generated team_config:")
    print(f"  agent_names: {agent_names}")
    print(f"  manager_names: {manager_names}")
    print(f"  agent_to_index: {agent_to_index}")
    print(f"  final managers: {managers}")
    print(f"  final humans: {humans}")
    print(f"  seed: {seed_value}")

    return {
        "level": request.level,
        "seed": seed_value,
        "human_agents": {},  # Will be populated when roles are claimed
        "team_config": {
            "humans": humans,
            "managers": managers
        },
        "collaboration_mode": request.collaboration_mode,
        # Never log or echo this back to clients. None when the creator supplied no key.
        "openai_api_key": (request.openai_api_key or "").strip() or None
    }

def update_team_config_humans(lobby):
    """Update the humans list in team_config based on claimed roles"""
    # Get all human players
    human_roles = set()
    for player_info in lobby["players"].values():
        if not player_info.get("is_ai", True):
            human_roles.add(player_info["role"])
    
    # Convert role names to indices using the same logic as create_lobby_config
    agent_names = lobby["agent_names"]
    manager_names = lobby["manager_names"]
    all_agent_names = agent_names + manager_names
    
    # Map agent names to indices (1-based) - this matches algorithm's internal indexing
    agent_to_index = {name: i+1 for i, name in enumerate(all_agent_names)}
    
    # Update humans list
    humans = []
    for role in human_roles:
        if role in agent_to_index:
            humans.append(agent_to_index[role])
    
    lobby["lobby_config"]["team_config"]["humans"] = humans

def get_name_id_mappings(lobby):
    """Get name to ID and ID to name mappings for a lobby"""
    agent_names = lobby["agent_names"]
    manager_names = lobby["manager_names"]
    all_agent_names = agent_names + manager_names
    
    name_to_id = {name: i+1 for i, name in enumerate(all_agent_names)}
    id_to_name = {i+1: name for i, name in enumerate(all_agent_names)}
    
    return name_to_id, id_to_name

def create_chats_for_lobby(lobby):
    """Create all necessary chats for a lobby based on communication mode and hierarchy"""
    name_to_id, _ = get_name_id_mappings(lobby)
    chats = {}
    
    if lobby["communication_mode"] == "team_chat":
        # Single team chat with all players
        all_participants = []
        for name in lobby["agent_names"] + lobby["manager_names"]:
            if name in name_to_id:
                all_participants.append(name_to_id[name])
        chats["team_chat"] = all_participants
        
    else:  # hierarchical communication
        # Create subteam chats for each manager
        for manager_name, config in lobby["hierarchy"].items():
            if manager_name in name_to_id:
                participants = [name_to_id[manager_name]]
                # New format: config is {children: [...], type: "...", team_name: "..."}
                children = config.get("children", [])
                for child_name in children:
                    if child_name in name_to_id:
                        participants.append(name_to_id[child_name])
                chats[f"subteam_{manager_name}"] = participants
    
    return chats

def human_names_by_id(lobby, name_to_id):
    """Role id -> player name for every role a human has claimed"""
    return {
        name_to_id[info["role"]]: player_name
        for player_name, info in lobby["players"].items()
        if info.get("role") in name_to_id and not info.get("is_ai", True)
    }

def convert_chats_to_names(chats_data, id_to_name, human_by_id=None):
    """Convert chat data from IDs to names for frontend.
    Humans appear under their player name; sender_role carries the role (AGENT_n) either way."""
    human_by_id = human_by_id or {}
    converted = {}
    for chat_id, chat_data in chats_data.items():
        converted[chat_id] = {
            "participants": [human_by_id.get(pid) or id_to_name.get(pid, f"UNKNOWN_{pid}") for pid in chat_data["participants"]],
            "messages": []
        }
        for msg in chat_data["messages"]:
            sid = msg["sender_id"]
            converted[chat_id]["messages"].append({
                "sender": human_by_id.get(sid) or id_to_name.get(sid, f"UNKNOWN_{sid}"),
                "sender_role": id_to_name.get(sid),
                "message": msg["message"],
                "timestamp": msg["timestamp"]
            })
    return converted

def poll_algorithm_service(lobby_id: str):
    """Background task to continuously poll algorithm service for observations and chats"""
    print(f"Starting polling for lobby {lobby_id}")
    
    while lobby_id in active_sessions and active_sessions[lobby_id].get("session_active", False):
        try:
            # Poll for observations
            response = requests.get(f"{ALGORITHM_SERVICE_URL}/observations_batch/{lobby_id}", timeout=5)
            if response.status_code == 200:
                observations = response.json()
                #print(f"[OBSERVATIONS DEBUG] Observations: {observations}")

                # Detect natural game end: algorithm service reports game is no longer active
                if isinstance(observations, dict) and observations.get("error") == "Game not active":
                    print(f"[POLLING] Game {lobby_id} ended naturally on algorithm side, marking as finished")
                    lobby = active_sessions[lobby_id]
                    lobby["status"] = "finished"
                    lobby["session_active"] = False
                    player_heartbeats.pop(lobby_id, None)
                    pending_actions.pop(lobby_id, None)
                    break

                if observations and not any("error" in str(obs) for obs in observations.values()):
                    # Update observations and mark them as available for current timestep
                    lobby = active_sessions[lobby_id]
                    lobby["current_observations"] = observations
                    # Get the timestep from any observation (since '1' may not exist)
                    if observations:
                        first_obs = next(iter(observations.values()))
                        lobby["observation_timestep"] = first_obs.get('timestep')
                    else:
                        lobby["observation_timestep"] = None
                    print(f"Lobby {lobby_id}: Got observations for timestep {lobby['observation_timestep']}")
            
            # Poll for chats
            chat_response = requests.get(f"{ALGORITHM_SERVICE_URL}/chats/{lobby_id}", timeout=5)
            if chat_response.status_code == 200:
                chat_data = chat_response.json()
                active_sessions[lobby_id]["chats"] = chat_data.get("chats", {})
            
            # Check heartbeat timeout - auto-stop if all human players have disconnected
            if lobby_id in player_heartbeats and player_heartbeats[lobby_id]:
                now = time.time()
                lobby = active_sessions[lobby_id]
                human_players = [n for n, i in lobby["players"].items() if not i.get("is_ai", True)]
                if human_players and all(
                    now - player_heartbeats[lobby_id].get(n, 0) > 120 for n in human_players
                ):
                    print(f"[HEARTBEAT] All players timed out for lobby {lobby_id}, auto-stopping game")
                    lobby["status"] = "stopped"
                    lobby["session_active"] = False
                    lobby["stopped_at"] = datetime.now()
                    lobby["stopped_by"] = "heartbeat_timeout"
                    pending_actions.pop(lobby_id, None)
                    player_heartbeats.pop(lobby_id, None)
                    try:
                        requests.post(f"{ALGORITHM_SERVICE_URL}/stop_game/{lobby_id}", timeout=10)
                    except Exception as e:
                        print(f"[HEARTBEAT] Error stopping algorithm service: {e}")
                    break

            # Wait before next poll
            time.sleep(1)

        except Exception as e:
            print(f"Error polling algorithm service for lobby {lobby_id}: {e}")
            time.sleep(5)  # Wait longer on error

    print(f"Stopped polling for lobby {lobby_id}")


@app.get("/levels")
async def get_levels():
    """Get available game levels"""
    levels = load_levels()
    return {"levels": levels}

@app.get("/quickstart_presets")
async def get_quickstart_presets():
    """Get available quickstart presets"""
    try:
        presets_file = os.path.join(os.path.dirname(__file__), '..', 'quickstart_presets.json')
        with open(presets_file, 'r') as f:
            return {"presets": json.load(f)}
    except Exception as e:
        print(f"Error loading quickstart presets: {e}")
        return {"presets": {}}

@app.get("/config")
async def get_config():
    """Which language-model provider the server runs and whether creating a lobby needs an OpenAI key"""
    return get_llm_config()

@app.post("/create_lobby")
async def create_lobby(request: CreateLobbyRequest):
    """Create a new game lobby"""
    try:
        # Debug: Log what we received from frontend
        print(f"[CREATE LOBBY DEBUG] Received from frontend:")
        print(f"  lobby_id: {request.lobby_id}")
        print(f"  level: {request.level}")
        print(f"  roles: {request.roles}")
        print(f"  hierarchy: {request.hierarchy}")
        print(f"  communication_mode: {request.communication_mode}")
        print(f"  collaboration_mode: {request.collaboration_mode}")

        # Validate the creator-supplied OpenAI API key (never logged). A key is optional when
        # the algorithm service runs a local model or has a server-wide key configured.
        api_key = (request.openai_api_key or "").strip()
        if api_key:
            validate_openai_api_key(api_key)
        elif get_llm_config().get("requires_api_key", True):
            raise HTTPException(status_code=400, detail="An OpenAI API key is required to create a lobby")

        levels = load_levels()
        lobby_config = create_lobby_config(request, levels)
        agent_names = generate_agent_names(request.level, levels)
        
        # Use manager names from roles sent by frontend
        manager_names = request.roles.get("managers", [])
        
        print(f"[CREATE LOBBY DEBUG] Backend computed:")
        print(f"  agent_names: {agent_names}")
        print(f"  manager_names: {manager_names}")
        print(f"  final hierarchy: {request.hierarchy}")
        
        # Store lobby in backend
        active_sessions[request.lobby_id] = {
            "id": request.lobby_id,
            "creator": request.creator_name,
            "level": request.level,
            "status": "waiting",
            "players": {},
            "roles": {"agents": agent_names, "managers": manager_names},
            "hierarchy": request.hierarchy,
            "communication_mode": request.communication_mode,
            "collaboration_mode": request.collaboration_mode,
            "created_at": datetime.now(),
            "chat_messages": [],
            "lobby_config": lobby_config,
            "session_active": False,
            "current_timestep": 0,
            "observation_timestep": -1,  # Track which timestep observations are from
            # Add these for backward compatibility with claim_role
            "agent_names": agent_names,
            "manager_names": manager_names
        }
        
        # Initialize pending actions for this lobby
        pending_actions[request.lobby_id] = {}
        
        return {
            "status": "success",
            "lobby_id": request.lobby_id,
            "message": "Lobby created successfully"
        }

    except HTTPException:
        # Preserve validation errors (e.g. invalid API key -> 400)
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create lobby: {str(e)}")

@app.post("/claim_role")
async def claim_role(request: ClaimRoleRequest):
    """Claim a role in the lobby"""
    if request.lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    lobby = active_sessions[request.lobby_id]
    
    if lobby["status"] != "waiting":
        raise HTTPException(status_code=400, detail="Lobby is not accepting new players")
    
    # Check if role is available
    available_roles = set(lobby["agent_names"] + lobby["manager_names"])
    claimed_roles = {player["role"] for player in lobby["players"].values()}
    
    if request.role not in available_roles:
        raise HTTPException(status_code=400, detail="Role does not exist")
    
    if request.role in claimed_roles:
        raise HTTPException(status_code=400, detail="Role already claimed")
    
    # Claim the role
    lobby["players"][request.player_name] = {
        "name": request.player_name,
        "role": request.role,
        "joined_at": datetime.now(),
        "is_ai": False,
        "has_acted": False
    }
    
    # Update human agents in lobby config
    lobby["lobby_config"]["human_agents"][request.role] = request.player_name
    
    # Update team_config humans list
    update_team_config_humans(lobby)
    
    return {
        "status": "success",
        "message": f"Role {request.role} claimed successfully"
    }

@app.post("/unclaim_role")
async def unclaim_role(request: UnclaimRoleRequest):
    """Release the role a player claimed (only possible before the game starts)"""
    if request.lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")

    lobby = active_sessions[request.lobby_id]

    if lobby["status"] != "waiting":
        raise HTTPException(status_code=400, detail="Roles can only be released before the game starts")

    player = lobby["players"].pop(request.player_name, None)
    if player is None:
        return {"status": "success", "message": "No role to release"}

    lobby["lobby_config"]["human_agents"].pop(player["role"], None)
    update_team_config_humans(lobby)

    return {
        "status": "success",
        "message": f"Role {player['role']} released"
    }

@app.post("/start_game")
async def start_game(request: StartGameRequest):
    """Start the game"""
    if request.lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    lobby = active_sessions[request.lobby_id]
    
    if lobby["status"] != "waiting":
        raise HTTPException(status_code=400, detail="Game already started or finished")
    
    try:
        # Update lobby status
        lobby["status"] = "starting"
        
        # Send start request to algorithm service
        response = requests.post(
            f"{ALGORITHM_SERVICE_URL}/start_game",
            json={
                "lobby_id": request.lobby_id,
                "lobby_config": lobby["lobby_config"]
            },
            timeout=30
        )
        
        if response.status_code == 200:
            lobby["status"] = "running"
            lobby["session_active"] = True
            lobby["game_start_time"] = time.time()

            # Initialize heartbeats for all human players so timeout detection works immediately
            player_heartbeats[request.lobby_id] = {
                name: time.time()
                for name, info in lobby["players"].items()
                if not info.get("is_ai", True)
            }
            
            # Create chats for this lobby
            chats = create_chats_for_lobby(lobby)
            try:
                chat_response = requests.post(
                    f"{ALGORITHM_SERVICE_URL}/create_chats",
                    json={
                        "lobby_id": request.lobby_id,
                        "chats": chats
                    },
                    timeout=10
                )
                if chat_response.status_code != 200:
                    print(f"Warning: Failed to create chats: {chat_response.text}")
            except Exception as e:
                print(f"Warning: Failed to create chats: {e}")
            
            # Initialize has_acted to False for all players when game starts
            for player_name in lobby["players"]:
                lobby["players"][player_name]["has_acted"] = False
            
            # Start background polling task
            polling_thread = threading.Thread(
                target=poll_algorithm_service, 
                args=(request.lobby_id,), 
                daemon=True
            )
            polling_tasks[request.lobby_id] = polling_thread
            polling_thread.start()
            
            return {
                "status": "success",
                "message": "Game started successfully"
            }
        else:
            # Pass the algorithm service's own explanation through to the browser
            try:
                detail = response.json().get("detail", response.text)
            except ValueError:
                detail = response.text
            if response.status_code == 503:
                # Temporary condition (e.g. the local model is still loading):
                # keep the lobby joinable so the host can simply press Start again.
                lobby["status"] = "waiting"
                raise HTTPException(status_code=503, detail=detail)
            lobby["status"] = "error"
            if response.status_code == 400:
                raise HTTPException(status_code=400, detail=detail)
            raise HTTPException(status_code=500, detail=f"Algorithm service error: {detail}")

    except HTTPException:
        raise
    except requests.exceptions.RequestException as e:
        lobby["status"] = "error"
        raise HTTPException(status_code=500, detail=f"Failed to communicate with algorithm service: {str(e)}")
    except Exception as e:
        lobby["status"] = "error"
        raise HTTPException(status_code=500, detail=f"Failed to start game: {str(e)}")

@app.post("/submit_action")
async def submit_action(request: SubmitActionRequest):
    """Submit action from human player - batched for all players"""
    if request.lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    lobby = active_sessions[request.lobby_id]
    
    if not lobby["session_active"]:
        raise HTTPException(status_code=400, detail="Game session not active")
    
    # Store action in pending actions
    if request.lobby_id not in pending_actions:
        pending_actions[request.lobby_id] = {}
    
    pending_actions[request.lobby_id][request.agent_id] = request.action
    
    # Set has_acted to True for this player
    for player_name, player_info in lobby["players"].items():
        if player_info["role"] in lobby["agent_names"] + lobby["manager_names"]:
            role_index = (lobby["agent_names"] + lobby["manager_names"]).index(player_info["role"])
            if role_index + 1 == request.agent_id:
                lobby["players"][player_name]["has_acted"] = True
                break
    
    # Check if we have actions from all human players
    human_agent_ids = set()
    all_roles = lobby["agent_names"] + lobby["manager_names"]
    print(f"[ACTION DEBUG] All roles: {all_roles}")
    print(f"[ACTION DEBUG] Human agents config: {lobby['lobby_config']['human_agents']}")
    
    for role in lobby["lobby_config"]["human_agents"].keys():
        if role in all_roles:
            agent_id = all_roles.index(role) + 1
            human_agent_ids.add(agent_id)
            print(f"[ACTION DEBUG] Role {role} -> Agent ID {agent_id}")
    
    submitted_agent_ids = set(pending_actions[request.lobby_id].keys())
    
    print(f"[ACTION DEBUG] Expected human agent IDs: {human_agent_ids}")
    print(f"[ACTION DEBUG] Submitted agent IDs: {submitted_agent_ids}")
    print(f"[ACTION DEBUG] All humans submitted? {human_agent_ids.issubset(submitted_agent_ids)}")
    
    if human_agent_ids.issubset(submitted_agent_ids):
        # All human players have submitted actions, send batch to algorithm
        try:
            # Convert agent IDs to strings for algorithm service
            actions_for_algorithm = {str(agent_id): action for agent_id, action in pending_actions[request.lobby_id].items()}
            
            response = requests.post(
                f"{ALGORITHM_SERVICE_URL}/submit_actions_batch",
                json={
                    "lobby_id": request.lobby_id,
                    "actions": actions_for_algorithm,
                    "timestep": lobby["current_timestep"]
                },
                timeout=10
            )
            
            # Clear pending actions and increment timestep
            pending_actions[request.lobby_id] = {}
            lobby["current_timestep"] += 1
            
            # Reset has_acted flags for all players for the next turn
            for player_name in lobby["players"]:
                lobby["players"][player_name]["has_acted"] = False
            
            if response.status_code == 200:
                return {"status": "success", "message": "Actions submitted and processed"}
            else:
                return {"status": "error", "message": "Failed to process actions"}
                
        except requests.exceptions.RequestException as e:
            raise HTTPException(status_code=500, detail=f"Failed to communicate with algorithm service: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to submit actions: {str(e)}")
    else:
        # Still waiting for other players
        waiting_for_roles = []
        for role in lobby["lobby_config"]["human_agents"].keys():
            if role in all_roles:
                agent_id = all_roles.index(role) + 1
                if agent_id not in submitted_agent_ids:
                    waiting_for_roles.append(role)
        return {
            "status": "waiting",
            "message": f"Action stored, waiting for: {waiting_for_roles}"
        }

@app.get("/observations/{lobby_id}/{agent_id}")
async def get_observations(lobby_id: str, agent_id: int):
    """Get observations for a player's role"""
    if lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    lobby = active_sessions[lobby_id]
    
    if not lobby["session_active"]:
        return {"error": "Game session not active"}
    
    try:
        # Check collaboration mode for different observation handling
        collaboration_mode = lobby.get("collaboration_mode", "human_control")
        
        # For human_feedback mode, update observations whenever timestep changes
        if collaboration_mode == "human_feedback":
            if ("current_observations" in lobby and 
                lobby.get("observation_timestep", -1) > lobby.get("current_timestep", 0)):
                # New observation available, update current timestep
                lobby["current_timestep"] = lobby.get("observation_timestep", 0)
                
        # Check if we have cached observations for the current timestep
        if ("current_observations" in lobby and 
            lobby.get("observation_timestep") >= lobby.get("current_timestep")):
            all_observations = lobby["current_observations"]
            observation_data = all_observations.get(str(agent_id), {"error": f"Agent {agent_id} not found in observations"})
            
            # Add has_acted status for all players to the observation response
            if "error" not in observation_data:
                observation_data["players"] = {
                    player_name: {
                        "role": player_info["role"],
                        "has_acted": player_info.get("has_acted", False)
                    }
                    for player_name, player_info in lobby["players"].items()
                }
                observation_data["collaboration_mode"] = collaboration_mode
                
                # For managers in human_feedback mode, include children observation data (recursively)
                if (collaboration_mode == "human_feedback" and
                    observation_data.get("type") == -1 and  # Manager type
                    "children_ids" in observation_data):

                    # Helper function to recursively collect all descendants
                    def collect_descendants(agent_id):
                        descendants = {}
                        child_obs = all_observations.get(str(agent_id), {})

                        if child_obs and "error" not in child_obs:
                            # Add this child's data
                            descendants[str(agent_id)] = {
                                "name": child_obs.get("name", f"AGENT_{agent_id}"),
                                "type": child_obs.get("type", 0),
                                "alive": child_obs.get("alive", True),
                                "mission": child_obs.get("mission", "No mission assigned"),
                                "status_summary": child_obs.get("status_summary", "No status information"),
                                "percent_complete": child_obs.get("percent_complete", 0),
                                "options": child_obs.get("options", []),
                                "option_history": child_obs.get("option_history", []),
                                "current_phase": child_obs.get("current_phase"),
                                "phase_history": child_obs.get("phase_history", []),
                                "future_phases": child_obs.get("future_phases", []),
                                "children_ids": child_obs.get("children_ids", []),
                                "children_names": child_obs.get("children_names", [])
                            }

                            # If this child is also a manager, recursively get their children
                            if child_obs.get("type") == -1 and child_obs.get("children_ids"):
                                for grandchild_id in child_obs.get("children_ids", []):
                                    grandchild_data = collect_descendants(grandchild_id)
                                    descendants.update(grandchild_data)

                        return descendants

                    # Collect all descendants recursively
                    children_data = {}
                    for child_id in observation_data["children_ids"]:
                        child_descendants = collect_descendants(child_id)
                        children_data.update(child_descendants)

                    observation_data["children_data"] = children_data
            
            return observation_data
        
        # No observations available for current timestep yet
        return {
            "error": "Waiting for observations for current timestep",
            "waiting_for_timestep": lobby.get("current_timestep"),
            "current_observation_timestep": lobby.get("observation_timestep")
        }
        
    except Exception as e:
        return {"error": f"Failed to get observations: {str(e)}"}

@app.get("/lobby/{lobby_id}")
async def get_lobby_info(lobby_id: str):
    """Get lobby information"""
    if lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    lobby = active_sessions[lobby_id]
    
    # Remove sensitive information
    safe_lobby = {
        "id": lobby["id"],
        "creator": lobby["creator"],
        "level": lobby["level"],
        "status": lobby["status"],
        "players": lobby["players"],
        "roles": lobby["roles"],
        "hierarchy": lobby["hierarchy"],
        "communication_mode": lobby["communication_mode"],
        "collaboration_mode": lobby["collaboration_mode"],
        "created_at": lobby["created_at"],
        "session_active": lobby["session_active"],
        "stopped_at": lobby.get("stopped_at"),
        "stopped_by": lobby.get("stopped_by"),
    }
    
    return safe_lobby

@app.post("/submit_feedback")
async def submit_feedback(request: SubmitFeedbackRequest):
    """Submit human feedback for an agent"""
    if request.lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    lobby = active_sessions[request.lobby_id]
    
    if not lobby["session_active"]:
        raise HTTPException(status_code=400, detail="Game session not active")
    
    # Validate player
    if request.player_name not in lobby["players"]:
        raise HTTPException(status_code=403, detail="Player not in lobby")
    
    # Check if collaboration mode supports feedback
    collaboration_mode = lobby.get("collaboration_mode", "human_control")
    if collaboration_mode != "human_feedback":
        raise HTTPException(status_code=400, detail="Feedback not supported in this collaboration mode")
    
    try:
        # Send feedback to algorithm service
        response = requests.post(
            f"{ALGORITHM_SERVICE_URL}/submit_feedback",
            json={
                "lobby_id": request.lobby_id,
                "agent_id": request.agent_id,
                "feedback": request.feedback,
                "timestep": request.timestep,
                "player_name": request.player_name
            },
            timeout=10
        )
        
        if response.status_code == 200:
            return {"status": "success", "message": "Feedback submitted"}
        else:
            raise HTTPException(status_code=500, detail="Failed to submit feedback to algorithm service")
            
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Failed to communicate with algorithm service: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit feedback: {str(e)}")

@app.post("/send_chat")
async def send_chat(request: SendChatRequest):
    """Proxy: send a human chat message to the algorithm service"""
    if request.lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")

    lobby = active_sessions[request.lobby_id]

    if not lobby["session_active"]:
        raise HTTPException(status_code=400, detail="Game session not active")

    if request.player_name not in lobby["players"]:
        raise HTTPException(status_code=403, detail="Player not in lobby")

    try:
        response = requests.post(
            f"{ALGORITHM_SERVICE_URL}/send_chat",
            json={
                "lobby_id": request.lobby_id,
                "player_name": request.player_name,
                "target_agent_id": request.target_agent_id,
                "content": request.content,
                "message_id": request.message_id,
            },
            timeout=10,
        )
        if response.status_code == 200:
            return {"status": "ok"}
        else:
            raise HTTPException(status_code=500, detail="Algorithm service error")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Failed to communicate with algorithm service: {str(e)}")


@app.get("/get_chat")
async def get_chat(lobby_id: str, since_timestamp: str = ""):
    """Proxy: poll agent chat responses from the algorithm service"""
    if lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")

    try:
        params: dict = {"lobby_id": lobby_id}
        if since_timestamp:
            params["since_id"] = since_timestamp
        response = requests.get(
            f"{ALGORITHM_SERVICE_URL}/get_chat",
            params=params,
            timeout=10,
        )
        if response.status_code == 200:
            return response.json()
        else:
            return {"responses": []}
    except requests.exceptions.RequestException:
        return {"responses": []}


@app.get("/events")
async def get_events(lobby_id: str, since_seq: int = 0):
    """Proxy: poll real-time activity events from the algorithm service"""
    if lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")

    try:
        response = requests.get(
            f"{ALGORITHM_SERVICE_URL}/events",
            params={"lobby_id": lobby_id, "since_seq": since_seq},
            timeout=10,
        )
        if response.status_code == 200:
            return response.json()
        else:
            return {"events": [], "latest_seq": since_seq}
    except requests.exceptions.RequestException:
        return {"events": [], "latest_seq": since_seq}


@app.get("/phase_status")
async def get_phase_status(lobby_id: str):
    """Proxy: get current algorithm phase from the algorithm service"""
    if lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")

    try:
        response = requests.get(
            f"{ALGORITHM_SERVICE_URL}/phase_status",
            params={"lobby_id": lobby_id},
            timeout=10,
        )
        if response.status_code == 200:
            return response.json()
        else:
            return {"current_phase": "idle", "timestep": 0}
    except requests.exceptions.RequestException:
        return {"current_phase": "idle", "timestep": 0}


@app.post("/send_message")
async def send_message(request: SendMessageRequest):
    """Send a message to a specific chat"""
    if request.lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    lobby = active_sessions[request.lobby_id]
    
    # Validate player
    if request.player_name not in lobby["players"]:
        raise HTTPException(status_code=403, detail="Player not in lobby")
    
    # The sender is identified by the role they claimed (AGENT_n)
    name_to_id, _ = get_name_id_mappings(lobby)
    sender_id = name_to_id.get(lobby["players"][request.player_name].get("role"))
    if not sender_id:
        raise HTTPException(status_code=400, detail="Pick a role before sending messages")
    
    # Send message to algorithm service
    try:
        response = requests.post(
            f"{ALGORITHM_SERVICE_URL}/send_message",
            json={
                "lobby_id": request.lobby_id,
                "chat_id": request.chat_id,
                "sender_id": sender_id,
                "message": request.message,
                "timestamp": request.timestamp
            },
            timeout=10
        )
        
        if response.status_code == 200:
            return {"status": "success", "message": "Message sent"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send message to algorithm service")
            
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Failed to communicate with algorithm service: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send message: {str(e)}")

@app.get("/chats/{lobby_id}/{player_name}")
async def get_chats(lobby_id: str, player_name: str):
    """Get chats for a specific player in a lobby"""
    if lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")
    
    lobby = active_sessions[lobby_id]
    
    # Validate player
    if player_name not in lobby["players"]:
        raise HTTPException(status_code=403, detail="Player not in lobby")
    
    try:
        # Get all chats from algorithm service
        response = requests.get(
            f"{ALGORITHM_SERVICE_URL}/chats/{lobby_id}",
            timeout=10
        )
        
        if response.status_code != 200:
            return {"chats": {}}
        
        all_chats = response.json().get("chats", {})
        
        # Players are known by the role they claimed (AGENT_n), not by their display name
        name_to_id, id_to_name = get_name_id_mappings(lobby)
        player_id = name_to_id.get(lobby["players"][player_name].get("role"))
        
        if not player_id:
            return {"chats": {}}
        
        # Filter chats where player is a participant
        filtered_chats = {}
        for chat_id, chat_data in all_chats.items():
            if player_id in chat_data.get("participants", []):
                filtered_chats[chat_id] = chat_data
        
        # Convert IDs to names
        converted_chats = convert_chats_to_names(filtered_chats, id_to_name, human_names_by_id(lobby, name_to_id))
        
        return {"chats": converted_chats}
            
    except requests.exceptions.RequestException as e:
        return {"chats": {}}
    except Exception as e:
        return {"chats": {}}

@app.post("/heartbeat")
async def heartbeat(request: HeartbeatRequest):
    """Record a player heartbeat to detect disconnection"""
    if request.lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")
    lobby = active_sessions[request.lobby_id]
    if lobby.get("status") != "running":
        return {"status": "ok"}
    if request.lobby_id not in player_heartbeats:
        player_heartbeats[request.lobby_id] = {}
    player_heartbeats[request.lobby_id][request.player_name] = time.time()
    return {"status": "ok"}


@app.post("/stop_game")
async def stop_game_lobby(request: StopGameRequest):
    """Stop a running game session"""
    if request.lobby_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Lobby not found")
    lobby = active_sessions[request.lobby_id]
    if lobby["status"] not in ("running", "starting"):
        return {"status": "ok", "message": "Game already stopped"}
    print(f"[STOP GAME] Stopping lobby {request.lobby_id} (requested by {request.player_name})")
    lobby["status"] = "stopped"
    lobby["session_active"] = False
    lobby["stopped_at"] = datetime.now()
    lobby["stopped_by"] = request.player_name
    pending_actions.pop(request.lobby_id, None)
    player_heartbeats.pop(request.lobby_id, None)
    try:
        requests.post(f"{ALGORITHM_SERVICE_URL}/stop_game/{request.lobby_id}", timeout=10)
    except Exception as e:
        print(f"[STOP GAME] Warning: could not reach algorithm service: {e}")
    return {"status": "success", "message": "Game stopped"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "active_sessions": len(active_sessions),
        "service": "WILDFIRE Backend"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)