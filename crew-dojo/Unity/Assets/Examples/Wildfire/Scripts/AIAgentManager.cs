using System;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using Unity.MLAgents;
using Unity.MLAgents.SideChannels;
using Unity.MLAgents.Sensors;
using Dojo;
using Unity.Netcode;


namespace Examples.Wildfire
{
    public class AIAgentManager : MonoBehaviour
    {
        [SerializeField]
        public GameObject _firefighterAgentPrefab;
        public GameObject _bulldozerAgentPrefab;
        public GameObject _droneAgentPrefab;
        public GameObject _helicopterAgentPrefab;
        public GameObject _managerAgentPrefab;
        public GameObject _defaultAgentPrefab;


        private DojoConnection _connection;
        private GameManager _gameManager;
        private EventChannel _eventChannel
;
        public List<AIAgent> Agents = new();
        public Queue<AIAgent> UnusedAgents = new();
        

        public int NumAgents;
        public int StartingFirefighterAgents;
        public int StartingBulldozerAgents;
        public int StartingDroneAgents;
        public int StartingHelicopterAgents;
        public int AgentIndex;

        public bool replay_enabled;

        // Replay mode fields
        private Dictionary<int, List<float[]>> _replayTrajectories = new Dictionary<int, List<float[]>>();
        private string _replayFilePath = "/Resources/replays/pickup.txt";

        private void Awake()
        {
            replay_enabled = false;

            _connection = FindObjectOfType<DojoConnection>();
            _gameManager = FindObjectOfType<GameManager>();
            NumAgents = 0;
            StartingFirefighterAgents = 0;
            StartingBulldozerAgents = 0;
            StartingDroneAgents = 0;
            StartingHelicopterAgents = 0;
            AgentIndex = 0;




            var args = Environment.GetCommandLineArgs();

            Debug.Log(args);
            for (var idx = 0; idx < args.Length; ++idx)
            {
                var arg = args[idx];

                if (arg.Equals("-NumAgents") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var num) && num >= 0)
                {
                    NumAgents = num;
                    
                    Debug.Log("recieved max agents: " + NumAgents);

                }
                else if (arg.Equals("-StartingFirefighterAgents") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var firenum) && firenum >= 0)
                {
                    StartingFirefighterAgents = firenum;
                    
                    Debug.Log("recieved starting firefighter agents: " + StartingFirefighterAgents);
                }
                else if (arg.Equals("-StartingBulldozerAgents") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var bullnum) && bullnum >= 0)
                {
                    StartingBulldozerAgents = bullnum;

                    Debug.Log("recieved starting bulldozer agents: " + StartingBulldozerAgents);
                }
                else if (arg.Equals("-StartingDroneAgents") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var dronenum) && dronenum >= 0)
                {
                    StartingDroneAgents = dronenum;

                    Debug.Log("recieved starting drone agents: " + StartingDroneAgents);
                }
                else if (arg.Equals("-StartingHelicopterAgents") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var helinum) && helinum >= 0)
                {
                    StartingHelicopterAgents = helinum;

                    Debug.Log("recieved starting helicopter agents: " + StartingHelicopterAgents);
                }

            }
            if (NumAgents == 0)
            {
                NumAgents = 100;
            }

            //StartingFirefighterAgents =1;
            //StartingBulldozerAgents = 0;
            //StartingDroneAgents = 0;
            //StartingHelicopterAgents = 1;

        }
        private void Update()
        {
            if (replay_enabled && Input.GetKeyDown(KeyCode.R))
            {
                StartReplay();
            }
        }




        public void SpawnAgents(Vector2 spawn_location)
        {
            
            List<String> players = new List<string>();


            for (int i = 0; i < NumAgents; i++) {

 

                GameObject gameAgent = Instantiate(_defaultAgentPrefab, new Vector3(0,-100,0), Quaternion.identity);
                AIAgent agent = gameAgent.GetComponent<AIAgent>();


                agent.AgentId = -1;
                UnusedAgents.Enqueue(agent);
                agent.ResetAgent();

            }

            Vector2 spawn_location_game = new Vector2(spawn_location.x - (ConfigReader.map_size / 2), -spawn_location.y + (ConfigReader.map_size / 2));
            
            RaycastHit hit;

            Physics.Raycast(new Vector3(spawn_location_game.x, 0, spawn_location_game.y) + new Vector3(0f, 1000f, 0f), new Vector3(0, -1, 0), out hit);
            float height = 1000- hit.distance;
           

            SpawnAgent(ControllerType.Manager, new Vector3(spawn_location_game.x, height+0.1f, spawn_location_game.y));
            for(int i = 0; i < StartingFirefighterAgents; i++)
            {
                SpawnAgent(ControllerType.Firefighter, new Vector3(spawn_location_game.x, height + 0.2f, spawn_location_game.y));
            }
            for (int i = 0; i < StartingBulldozerAgents; i++)
            {
                SpawnAgent(ControllerType.Bulldozer, new Vector3(spawn_location_game.x, height + 0.1f, spawn_location_game.y));
            }
            for (int i = 0; i < StartingDroneAgents; i++)
            {
                SpawnAgent(ControllerType.Drone, new Vector3(spawn_location_game.x, height + 13f, spawn_location_game.y));
            }
            for (int i = 0; i < StartingHelicopterAgents; i++)
            {
                SpawnAgent(ControllerType.Helicopter, new Vector3(spawn_location_game.x, height + 17, spawn_location_game.y));
            }


            if (replay_enabled){
                LoadReplayFromFile();
            }


        }
        public void SpawnAgent(ControllerType type, Vector3 pos)
        {
            if (!_connection.IsServer)
                throw new NotServerException("You must spawn agents on the server for server ownership");


            List<String> players = new List<string>();
            players.Add("Agent-" + AgentIndex.ToString() + "");
            AgentIndex = _connection.RegisterAIPlayers(players);
            

            var prefab = this.gameObject;
            switch (type) {
                case ControllerType.Firefighter:
                    prefab = _firefighterAgentPrefab;
                    break;
                case ControllerType.Bulldozer:
                    prefab = _bulldozerAgentPrefab;
                    break;
                case ControllerType.Drone:
                    prefab = _droneAgentPrefab;
                    break;
                case ControllerType.Helicopter:
                    prefab = _helicopterAgentPrefab;
                    break;
                case ControllerType.Manager:
                    prefab = _managerAgentPrefab;
                    break;
            }


            AIAgent agent = UnusedAgents.Dequeue();
            agent.controllerType = type;

            

            GameObject controller = Instantiate(prefab, new Vector3(pos.x, pos.y, pos.z), Quaternion.identity);
            PlayerController c = controller.GetComponent<PlayerController>();
            NetworkObject netObj = controller.GetComponent<NetworkObject>();
            agent.transform.SetParent(c.transform);


            agent.controller = c;
            c.agent = agent;
            agent.AgentId = AgentIndex - 1;
            Agents.Add(agent);
            agent.ResetAgent();
            netObj.Spawn();

        }


        public void DestroyAgent(int agentId)
        {
            if (!_connection.IsServer)
            {
                Debug.LogWarning("DestroyAgent can only be called on server");
                return;
            }

            AIAgent targetAgent = null;
            foreach (AIAgent agent in Agents)
            {
                if (agent.AgentId == agentId)
                {
                    targetAgent = agent;
                    break;
                }
            }

            if (targetAgent == null)
            {
                Debug.LogWarning($"DestroyAgent: Agent {agentId} not found");
                return;
            }

            if (targetAgent.controllerType == ControllerType.Manager)
            {
                Debug.LogWarning("Cannot destroy Manager agent");
                return;
            }

            PlayerController controller = targetAgent.controller;
            MapManager map = FindObjectOfType<MapManager>();

            switch (targetAgent.controllerType)
            {
                case ControllerType.Firefighter:
                    map.firefighters.Remove(controller as Firefighter);
                    break;
                case ControllerType.Bulldozer:
                    map.bulldozers.Remove(controller as Bulldozer);
                    break;
                case ControllerType.Drone:
                    map.drones.Remove(controller as Drone);
                    break;
                case ControllerType.Helicopter:
                    Helicopter heli = controller as Helicopter;
                    // Release any firefighters being carried before destroying
                    if (heli.firefightercarry != null && heli.firefightercarry.Count > 0)
                    {
                        Debug.Log($"Helicopter {agentId} destroyed while carrying {heli.firefightercarry.Count} firefighters. Releasing them.");
                        foreach (Firefighter f in heli.firefightercarry)
                        {
                            f.active = true;
                        }
                        heli.firefightercarry.Clear();
                    }
                    map.helicopters.Remove(heli);
                    break;
            }

            controller.clearChunks(controller.chunk_radius);

            // Hide visuals (match fire death behavior — keep agent in ML-Agents loop)
            if (controller.mapSprite != null)
                controller.mapSprite.SetActive(false);
            MeshRenderer mesh = controller.GetComponent<MeshRenderer>();
            if (mesh != null)
                mesh.enabled = false;

            // Make blank agent — keep in ML-Agents decision loop
            targetAgent.controllerType = ControllerType.Default;
            controller.controllerType = ControllerType.Default;

            // Do NOT set IsPlayerAlive = false (would stop DecisionRequestLoop)
            // Do NOT Destroy controller.gameObject (would remove from ML-Agents)
            // Do NOT Despawn NetworkObject (would break ML-Agents tracking)
            // Do NOT remove from Agents list or enqueue in UnusedAgents

            Debug.Log($"Agent {agentId} destroyed (made blank)");
        }

        private void Initialize()
        {
            Debug.Assert(_connection.IsServer);

            if (Academy.IsInitialized)
            {
                // register MLAgent environment
                _eventChannel = new(_connection);
                if (_eventChannel.IsInitialized)
                {
                    SideChannelManager.RegisterSideChannel(_eventChannel);
                }
            }
        }

        private void OnDestroy()
        {
            if (Academy.IsInitialized)
            {
                if (_eventChannel.IsInitialized)
                {
                    SideChannelManager.UnregisterSideChannel(_eventChannel);
                }
            }
        }

        public void LoadReplayFromFile()
        {
            try
            {
                if (!System.IO.File.Exists(Application.streamingAssetsPath + _replayFilePath))
                {
                    Debug.LogError($"Replay file not found: {_replayFilePath}");
                    return;
                }

                _replayTrajectories.Clear();
                
                // Read the file using FileReader
                string[] lines = System.IO.File.ReadAllLines(Application.streamingAssetsPath + _replayFilePath);
                
                if (lines.Length < 3) // Need at least header + time1 + one agent action
                {
                    Debug.LogError("Replay file is empty or missing header");
                    return;
                }

                // First line contains the number of agents and steps
                string[] header = lines[0].Split(',');
                if (header.Length != 2)
                {
                    Debug.LogError("Invalid header format. Expected: numAgents,numSteps");
                    return;
                }

                if (!int.TryParse(header[0], out int numAgents) || !int.TryParse(header[1], out int numSteps))
                {
                    Debug.LogError("Invalid header values. Expected integers for numAgents and numSteps");
                    return;
                }

                if (numAgents <= 0 || numSteps <= 0)
                {
                    Debug.LogError("Invalid header values. numAgents and numSteps must be positive");
                    return;
                }

                // Verify file has correct number of lines
                int expectedLines = 1 + numSteps + (numSteps * numAgents); // header + time lines + action lines
                if (lines.Length != expectedLines)
                {
                    Debug.LogError($"Invalid file length. Expected {expectedLines} lines but found {lines.Length}");
                    return;
                }

                // Initialize trajectories for each agent
                for (int agentId = 0; agentId < numAgents; agentId++)
                {
                    _replayTrajectories[agentId] = new List<float[]>();
                }
                
                // Read actions by timestep
                int currentLine = 1; // Start after header
                for (int step = 0; step < numSteps; step++)
                {
                    // Skip timestep line
                    currentLine++;
                    
                    // Read actions for all agents at this timestep
                    for (int agentId = 0; agentId < numAgents; agentId++)
                    {
                        string[] parts = lines[currentLine].Split(',');
                        if (parts.Length != 3)
                        {
                            Debug.LogError($"Invalid action format at line {currentLine + 1}. Expected 3 values per action");
                            return;
                        }

                        float[] action = new float[3];
                        for (int j = 0; j < parts.Length; j++)
                        {
                            if (!float.TryParse(parts[j], out float value))
                            {
                                Debug.LogError($"Invalid action value at line {currentLine + 1}, value {j + 1}: {parts[j]}");
                                return;
                            }
                            action[j] = value;
                        }
                        _replayTrajectories[agentId].Add(action);
                        currentLine++;
                    }
                }

                Debug.Log($"Successfully loaded replay trajectories for {_replayTrajectories.Count} agents");
            }
            catch (Exception e)
            {
                Debug.LogError($"Error loading replay file: {e.Message}");
                _replayTrajectories.Clear();
            }
        }

        public void StartReplay()
        {
            if (_replayTrajectories.Count == 0)
            {
                Debug.LogWarning("No replay trajectories loaded. Call LoadReplayFromFile first.");
                return;
            }

            // Distribute trajectories to agents
            foreach (AIAgent agent in Agents)
            {
                if (_replayTrajectories.TryGetValue(agent.AgentId-1, out var trajectory))
                {
                    agent.SetReplayMode(true, trajectory);
                }
            }
        }

        public void StopReplay()
        {
            // Reset all agents to normal mode
            foreach (AIAgent agent in Agents)
            {
                agent.SetReplayMode(false);
            }
        }

    }

}
