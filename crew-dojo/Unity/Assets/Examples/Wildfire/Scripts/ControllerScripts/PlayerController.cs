using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using System;
using UnityEngine.InputSystem;
using Dojo;
using Unity.Netcode;
using Unity.MLAgents.Sensors;


namespace Examples.Wildfire
{

    public abstract class PlayerController : NetworkBehaviour
    {
        public AIAgent agent;
        public InputActionAsset _playerActions;

        [SerializeField]
        protected InputActionMap _playerControl;
        protected DojoConnection Connection;
        protected bool IsClient;
        protected bool IsPlayer;
        protected bool IsClientConnected = false;
        public int chunk_radius;
        [HideInInspector] public event Action<NetCommand> OnNewAction;
        [HideInInspector] public event Action<byte[]> OnNewState;
        [HideInInspector] public event Action<int, int> OnFrameEnded;
        [HideInInspector] public event Action OnEpisodeEnded;


        public MeshRenderer mesh_renderer;
        protected int range;
        public MapManager map;
        public Vector2 gridPos;
        public Vector2 old;
        public int playerid;
        public bool controlled;
        public Material main_material;
        public Material alt_material;

        public int prevXchunk;
        public int prevYchunk;

        public ControllerType controllerType;
        public int[] extraVariables = { 0, 0, 0 };

        public GameObject mapSprite;
        public Camera spriteCamera;
        public Camera povCam;
        public GameObject mapSpritePrefab;
        public TextMesh spritetext;

        public RenderTexture minimapTexture;
        public RenderTexture povTexture;



        private void Awake()
        {
            Connection = FindObjectOfType<DojoConnection>();
            IsClient = Connection.IsClient;
            IsPlayer = Connection.IsPlayer;
            Application.targetFrameRate = 50;

            
            this.map = FindObjectOfType<MapManager>();
            range = map.cellGrid.grid.Count;
            gridPos = new Vector2(this.transform.position.x + (range - 1) / 2, -this.transform.position.z + (range - 1) / 2);
            old = new Vector2(0, 0);


            if(this.controllerType!=ControllerType.Manager && this.controllerType != ControllerType.Default)
            {
                povCam = GetComponentInChildren<Camera>();
                mapSprite = Instantiate<GameObject>(mapSpritePrefab, new Vector3(0, 0, 0), Quaternion.identity, map._canvas.transform);
                spriteCamera = mapSprite.GetComponentInChildren<Camera>();
                spritetext = mapSprite.GetComponentInChildren<TextMesh>();
                


                if (!IsClient)
                {
                    int dataRange = (int)MapManager.miniMapRanges[(int)controllerType];
                    spriteCamera.orthographicSize = (float)dataRange/range;
                    minimapTexture = new RenderTexture(200, 200, 0);
                    spriteCamera.targetTexture = minimapTexture;
                    povTexture = new RenderTexture(200, 200, 0);
                    povCam.targetTexture = povTexture;


                }
            }
        }


        public void Update()
        {


            if ((int)gridPos.x != (int)old.x || (int)gridPos.y != (int)old.y)
            {
                map.UpdateAccumulativeView();
            }
            old = gridPos;
            if (!Connection.IsClient)
            {
                //Debug.Log("attemping to send " + this.playerid);
                setIdClientRpc(this.playerid);

            }
            if (this.controllerType != ControllerType.Manager && this.controllerType != ControllerType.Default)

            {
                int dataRange = (int)MapManager.miniMapRanges[(int)controllerType];
                spriteCamera.orthographicSize = (float)dataRange / range;
                mapSprite.transform.position = new Vector3((this.transform.position.x - 1) / MapManager.mapSize.x, ((this.transform.position.z + 1) / MapManager.mapSize.y)-100, -0.1f);
                // Adjust the mapSprite's scale based on the range
                float sprite_size = 30.0f / range;
                mapSprite.transform.localScale = new Vector3(sprite_size, sprite_size, sprite_size);
                mapSprite.transform.GetChild(1).transform.eulerAngles = new Vector3(0, 0, -this.transform.eulerAngles.y);

                spritetext.text = "Agent" + agent.AgentId;
            }
        }
        public abstract void HandleActionArray(float[] actionArray);



        public void updateChunks(int radius)
        {

            for(int i = (prevXchunk-radius)-2; i<=(prevXchunk+radius)+2; i++)
            {
                for (int j = (prevYchunk - radius)-2; j <= (prevYchunk + radius)+2; j++)
                {
                    if(i>=0 && i < MapManager.chunkDim && j>=0 && j < MapManager.chunkDim)
                    {
                        double dist = Math.Sqrt(Math.Pow(prevXchunk - i, 2) + Math.Pow(prevYchunk - j, 2));
                        if(map.chunkMap[i, j]== null)
                        {
                            map.chunkMap[i,j] = new HashSet<int>();
                        }
                        if (dist > radius)
                        {
                            if(map.chunkMap[i, j].Contains(playerid)){

                                map.chunkMap[i, j].Remove(playerid);
                                map.RefreshChunk(i, j);
                            }
                        }
                        else
                        {
                            map.chunkMap[i, j].Add(playerid);
                            map.RefreshChunk(i, j);
                        }
                        
                    }
                    
                }
            }

        }

        public void clearChunks(int radius)
        {
            for (int i = (prevXchunk - radius) - 2; i <= (prevXchunk + radius) + 2; i++)
            {
                for (int j = (prevYchunk - radius) - 2; j <= (prevYchunk + radius) + 2; j++)
                {
                    if (i >= 0 && i < MapManager.chunkDim && j >= 0 && j < MapManager.chunkDim)
                    {
                        if (map.chunkMap[i, j].Contains(playerid))
                        {
                            map.chunkMap[i, j].Remove(playerid);
                            map.RefreshChunk(i, j);
                        }
                    }
                }
            }
        }
        public void ResetGameState()
        {
            //this.transform.position = new Vector3(0, 1, 0);
            this.transform.eulerAngles = new Vector3(0,0,0);
        }

        public void TogglePOV()
        {
            if (Connection.IsClient)
            {
                //GetComponent<CameraSensorComponent>().RuntimeCameraEnable = !GetComponent<CameraSensorComponent>().RuntimeCameraEnable;
                GetComponentInChildren<Camera>().enabled = !GetComponentInChildren<Camera>().enabled;

                this.controlled = !this.controlled;
                if (controlled)
                {
                    updateChunks(chunk_radius);
                }
                else
                {
                    clearChunks(chunk_radius);
                }
            }
        }

        // Sets all client player controller to the right player ids

        [ClientRpc]
        public void setIdClientRpc(int id)
        {
            playerid = id;
            Debug.Log("recieved " + id);
        }

        [ClientRpc]
        public void setMainMaterialClientRpc()
        {
            mesh_renderer.material = main_material;
        }

        [ClientRpc]
        public void setAltMaterialClientRpc()
        {
            mesh_renderer.material = alt_material;
        }


        public override void OnNetworkSpawn()
        {
            if (!Connection.IsClient)
            {
                playerid = Connection.RegisterAIPlayers(new List<string>())-1;
            }
        }
    }
}