using System;
using UnityEngine;
using Dojo;
using System.Collections.Generic;
using Nakama.TinyJson;
using Unity.Netcode;
using Dojo.Netcode;
using Unity.MLAgents;
using UnityEngine.AI;
using Unity.Netcode.Components;
using System.IO;

namespace Examples.Wildfire
{
    [DefaultExecutionOrder(-1)]
    public class GameManager : MonoBehaviour
    {
        [SerializeField]
        private DojoConnection _connection;
        private DojoTransport _transport;
        private AIAgentManager _agentManager;
        private MapManager mapManager;


        // frames before first fire can spawn
        private int startframes;
        private int frame;

        public int step;
        public int max_steps;
        public float tick_rate;


        public float ignition_chance;
        public float false_fire_chance;
        public bool fire_started;


        private bool IsClient => _connection.IsClient;
        public Camera serverCam;
        public RenderTexture serverTexture;
        public Camera clientCam;



        public AIAgent manager_agent;



        private static string starttime = $"{System.DateTime.Now:yyyy-MM-dd_HH-mm-ss}";

        public int frames_per_capture;
        public List<PlayerController> playercontrollers;


        private Vector2 spawn_location;
        public static List<int> returnVariables;
        public static HashSet<Civilian> rescued_civilians = new HashSet<Civilian>();
        public static HashSet<Firefighter> transported_firefighters = new HashSet<Firefighter>();

        public static int score;
        public static int base_score;

        private Texture2D _serverCaptureTex;
        private Dictionary<PlayerController, Texture2D> _minimapCaptureTexs = new();
        private Dictionary<PlayerController, Texture2D> _povCaptureTexs = new();
        private Texture2D _highResCache;
        private int _cacheWidth, _cacheHeight;



        private void Awake()
        {


            frames_per_capture = 30;
            ignition_chance = 1;
            false_fire_chance = 1;
            startframes = 0;
            score = 0;

            step = 0;
            fire_started = false;
            Application.targetFrameRate = 50;
            QualitySettings.vSyncCount = 0;
            Debug.Assert(FindObjectsOfType<GameManager>().Length == 1, "Only one game manager is allowed!");
            _connection = FindObjectOfType<DojoConnection>();
            _agentManager = GetComponentInChildren<AIAgentManager>();
            returnVariables = new List<int>();

            


            _connection.SubscribeRemoteMessages((long)NetOpCode.ClientAction, OnClientAction);
            _connection.SubscribeRemoteMessages((long)NetOpCode.ServerState, OnServerState);
            _connection.SubscribeRemoteMessages((long)NetOpCode.GameEvent, OnGameEvent);
            if (!_connection.IsClient)
            {
                serverCam.enabled = true;
                clientCam.enabled = true;
                serverCam.targetTexture = serverTexture;
            }
            else
            {
                serverCam.enabled = false;
                clientCam.enabled = true;
            }
        }
        private void Start()
        {
            mapManager = FindObjectOfType<MapManager>();
            NetworkManager.Singleton.OnServerStarted += OnServerStarted;
            var args = Environment.GetCommandLineArgs();

            for (var idx = 0; idx < args.Length; ++idx)
            {
                var arg = args[idx];

                if (arg.Equals("-DecisionRequestFrequency") && idx < args.Length - 1 && float.TryParse(args[idx + 1], out var requestFreq))
                {
                    tick_rate = requestFreq;
                    ++idx;
                }
                tick_rate = 2f;

                if (arg.Equals("-MaxSteps") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var maxStep))
                {
                    max_steps = maxStep;
                    ++idx;
                }
                if (arg.Equals("-ServerCamSize") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var camSize))
                {
                    serverCam.orthographicSize = 0.5f / camSize;
                    ++idx;
                }
                max_steps = 600;

            }
            


        }
        public void SetUpGame()
        {
            returnVariables.Add((int)ConfigReader.game_type);
            returnVariables.Add(ConfigReader.map_size);
            // 13 reward dimensions at indices [2..14]
            for (int ri = 0; ri < 13; ri++) returnVariables.Add(0);
            rescued_civilians = new HashSet<Civilian>();
            transported_firefighters = new HashSet<Firefighter>();

            System.Random random = new System.Random(ConfigReader.seed);

            int spawn_x = random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f);
            int spawn_y = random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f);
            Debug.Log("spawn location: " + spawn_x + ", " + spawn_y);
            spawn_location = new Vector2(spawn_x, spawn_y);

            if (ConfigReader.game_type == GameType.CutTrees)
            {
                returnVariables.Add(ConfigReader.lines ? (1) : (0));
                returnVariables.Add(ConfigReader.tree_count);
                Debug.Log("tree count: " + ConfigReader.tree_count);
                Debug.Log("map size: " + ConfigReader.map_size);

                HashSet<(int, int)> chosen = new HashSet<(int, int)>();
                if (!ConfigReader.lines)
                {

                    for (int i = 0; i < ConfigReader.tree_count; i++)
                    {
                        bool valid = false;
                        // Minimum Chebyshev distance between chosen tree cells, so targets
                        // spread out instead of clumping in one dense patch. Relaxed by
                        // halving every 200 failed attempts so a solution always exists
                        // and setup can never stall.
                        float min_separation = 0.1f * ConfigReader.map_size;
                        int attempts = 0;
                        while (!valid)
                        {
                            int tree_x = random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f);
                            int tree_y = random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f);

                            attempts++;
                            if (attempts % 200 == 0)
                            {
                                min_separation /= 2f;
                                Debug.Log("relaxing tree separation to " + min_separation);
                            }

                            Debug.Log(tree_x + ", " + tree_y);

                            Cell currCell = mapManager.cellGrid.grid[(int)tree_y][(int)tree_x];


                            float min_distance = 0.1f * ConfigReader.map_size;
                            Debug.Log("mindistance: " + min_distance);

                            bool farFromChosen = true;
                            foreach (var c in chosen)
                            {
                                if (Math.Max(Math.Abs(c.Item1 - tree_x), Math.Abs(c.Item2 - tree_y)) < min_separation)
                                {
                                    farFromChosen = false;
                                    break;
                                }
                            }

                            // Only accept cells with a full 3 trees so the task always has
                            // exactly tree_count * 3 trees to cut (trees-cut starts at 0).
                            if (Math.Abs(spawn_location.x - tree_x) > min_distance && Math.Abs(spawn_location.y - tree_y) > min_distance && farFromChosen && mapManager.cellGrid.grid[(int)tree_y][(int)tree_x].trees != null && mapManager.cellGrid.grid[(int)tree_y][(int)tree_x].trees.count == 3 && !chosen.Contains((tree_x, tree_y)))
                            {
                                Debug.Log("valid");
                                valid = true;
                                returnVariables.Add(tree_x);
                                returnVariables.Add(tree_y);
                                chosen.Add((tree_x, tree_y));
                                base_score += 3-mapManager.cellGrid.grid[(int)tree_y][(int)tree_x].trees.count;
                            }
                            else
                            {
                                Debug.Log("invalid");
                            }

                        }
                    }

                }
                else
                {
                    for (int i = 0; i < ConfigReader.tree_count; i++)
                    {
                        bool valid = false;
                        while (!valid)
                        {
                            int tree_x = random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f);
                            int tree_y = random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f);

                            Debug.Log(tree_x + ", " + tree_y);


                            float min_distance = 0.2f * ConfigReader.map_size;
                            Debug.Log("mindistance: " + min_distance);
                            if (Math.Abs(spawn_location.x - tree_x) > min_distance && Math.Abs(spawn_location.y - tree_y) > min_distance&& !chosen.Contains((tree_x, tree_y)))
                            {
                                Debug.Log("valid");
                                valid = true;

                                bool isHorizontal = random.Next(2) == 0; // 50% chance for horizontal or vertical

                                int numTrees = ConfigReader.trees_per_line;
                                int left, right, up, down;
                                int startX, startY, endX, endY;

                                // For even/odd cases, put the center tree at tree_x, tree_y and expand outward
                                int leftHalf = (numTrees - 1) / 2;
                                int rightHalf = numTrees / 2;
                                if (isHorizontal)
                                {
                                    // Make sure the line fits inside the map boundary
                                    tree_x = Math.Max(leftHalf, Math.Min(tree_x, ConfigReader.map_size - rightHalf - 1));
                                    startX = tree_x - leftHalf;
                                    endX = tree_x + rightHalf;
                                    startY = endY = tree_y; // same y
                                }
                                else
                                {
                                    // Make sure the line fits inside the map boundary
                                    tree_y = Math.Max(leftHalf, Math.Min(tree_y, ConfigReader.map_size - rightHalf - 1));
                                    startY = tree_y - leftHalf;
                                    endY = tree_y + rightHalf;
                                    startX = endX = tree_x; // same x
                                }


                                chosen.Add((tree_x, tree_y));
                                returnVariables.Add(startX);
                                returnVariables.Add(startY);
                                returnVariables.Add(endX);
                                returnVariables.Add(endY);



                            }
                            else
                            {
                                Debug.Log("invalid");
                            }

                        }
                    }

                }
            }


            else if (ConfigReader.game_type == GameType.ScoutFire)
            {
                bool fvalid = false;
                while (!fvalid)
                {
                    int fire_x = random.Next((int)(ConfigReader.map_size * 0.9f)) + (int)(ConfigReader.map_size * 0.05f);
                    int fire_y = random.Next((int)(ConfigReader.map_size * 0.9f)) + (int)(ConfigReader.map_size * 0.05f);

                    Debug.Log(fire_x + ", " + fire_y);


                    float min_distance = 0.4f * ConfigReader.map_size;
                    Debug.Log("mindistance: " + min_distance);
                    if (Math.Abs(spawn_location.x - fire_x) > min_distance || Math.Abs(spawn_location.y - fire_y) > min_distance)
                    {
                        fvalid = mapManager.SetFire((float)fire_x, (float)fire_y);
                        Debug.Log("fire start " + fvalid);

                        if (fvalid)
                        {
                            returnVariables.Add(fire_x);
                            returnVariables.Add(fire_y);

                        }


                    }
                    else
                    {
                        Debug.Log("invalid");
                    }

                }
            }

            else if (ConfigReader.game_type == GameType.PickAndPlace)
            {
                bool pvalid = false;
                while (!pvalid)
                {
                    int target_x = random.Next((int)(ConfigReader.map_size * 0.9f)) + (int)(ConfigReader.map_size * 0.05f);
                    int target_y = random.Next((int)(ConfigReader.map_size * 0.9f)) + (int)(ConfigReader.map_size * 0.05f);

                    Debug.Log(target_x + ", " + target_y);
                    float min_distance = 0.4f * ConfigReader.map_size;
                    Debug.Log("mindistance: " + min_distance);
                    if (Math.Abs(spawn_location.x - target_x) > min_distance && Math.Abs(spawn_location.y - target_y) > min_distance)
                    {
                        returnVariables.Add(target_x);
                        returnVariables.Add(target_y);
                        pvalid = true;

                    }
                }
            }
            
            else if (ConfigReader.game_type == GameType.ContainFire)
            {
                Debug.Log("water: " + ConfigReader.water.ToString());
                bool fvalid = false;
                while (!fvalid)
                {
                    int fire_x = random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f);
                    int fire_y = random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f);

                    Debug.Log("fire location" + fire_x + ", " + fire_y);

                    float min_distance = 0.20f * ConfigReader.map_size;
                    //float min_distance = 0.3f * ConfigReader.map_size;
                    Debug.Log("mindistance: " + min_distance);
                    if (Math.Abs(spawn_location.x - fire_x) > min_distance || Math.Abs(spawn_location.y - fire_y) > min_distance)
                    {
                        fvalid = mapManager.SetFire((float)fire_x, (float)fire_y);
                        Debug.Log("fire start " + fvalid);

                        if (fvalid)
                        {
                            returnVariables.Add(fire_x);
                            returnVariables.Add(fire_y);


                            if (ConfigReader.water)
                            {
                                bool wvalid = false;
                                while (!wvalid)
                                {
                                    int water_x = random.Next((int)(ConfigReader.map_size * 0.9f)) + (int)(ConfigReader.map_size * 0.05f);
                                    int water_y = random.Next((int)(ConfigReader.map_size * 0.9f)) + (int)(ConfigReader.map_size * 0.05f);


                                    if (water_x != fire_x || water_y != fire_y)
                                    {
                                        Debug.Log("water location" + water_x + ", " + water_y);
                                        mapManager.setWater(new Vector2(water_x, water_y));
                                        returnVariables.Add(water_x);
                                        returnVariables.Add(water_y);
                                        wvalid = true;

                                    }
                                }

                                
                            }

                        }
                    }
                    else
                    {
                        Debug.Log("invalid");
                    }

                }


            }

            else if (ConfigReader.game_type == GameType.MoveCivilians)
            {

                int target_x = random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f);
                int target_y = random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f);
                returnVariables.Add(target_x);
                returnVariables.Add(target_y);
                Debug.Log("target: "+ target_x + ", " + target_y);

                for (int i = 0; i < ConfigReader.civilian_cluster_count; i++)
                {
                    bool valid = false;
                    float min_distance = 0.3f * ConfigReader.map_size;
                    float min_player_distance = 0.2f * ConfigReader.map_size;

                    while (!valid)
                    {
                        Vector2 civ_spawn_location = new Vector2(random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f), random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f));
                        Debug.Log("attempt: " + civ_spawn_location.x + ", " + civ_spawn_location.y);

                        if ((Math.Abs(civ_spawn_location.x - target_x) > min_distance || Math.Abs(civ_spawn_location.y - target_y) > min_distance) && (Math.Abs(civ_spawn_location.x - spawn_x) > min_player_distance || Math.Abs(civ_spawn_location.y - spawn_y) > min_player_distance))
                        {
                            mapManager.SpawnCivilians(ConfigReader.civilian_count, civ_spawn_location);
                            returnVariables.Add((int)civ_spawn_location.x);
                            returnVariables.Add((int)civ_spawn_location.y);
                            Debug.Log("civ_spawn: " + civ_spawn_location.x + ", " + civ_spawn_location.y);
                            valid = true;
                        }
                    }
     

                }


            }
            else if (ConfigReader.game_type== GameType.Both)
            {

                bool fvalid = false;
                while (!fvalid)
                {
                    int fire_x = random.Next((int)(ConfigReader.map_size * 0.7f)) + (int)(ConfigReader.map_size * 0.15f);
                    int fire_y = random.Next((int)(ConfigReader.map_size * 0.7f)) + (int)(ConfigReader.map_size * 0.15f);

                    Debug.Log("fire location" + fire_x + ", " + fire_y);


                    float min_distance = 0.25f * ConfigReader.map_size;
                    Debug.Log("mindistance: " + min_distance);
                    if (Math.Abs(spawn_location.x - fire_x) > min_distance || Math.Abs(spawn_location.y - fire_y) > min_distance)
                    {
                        fvalid = mapManager.SetFire((float)fire_x, (float)fire_y);
                        Debug.Log("fire start " + fvalid);

                        if (fvalid)
                        {
                            returnVariables.Add(fire_x);
                            returnVariables.Add(fire_y);


                            if (ConfigReader.water)
                            {
                                bool wvalid = false;
                                while (!wvalid)
                                {
                                    int water_x = random.Next((int)(ConfigReader.map_size * 0.9f)) + (int)(ConfigReader.map_size * 0.05f);
                                    int water_y = random.Next((int)(ConfigReader.map_size * 0.9f)) + (int)(ConfigReader.map_size * 0.05f);

                                    if (water_x != fire_x && water_y != fire_y)
                                    {
                                        mapManager.setWater(new Vector2(water_x, water_y));
                                        returnVariables.Add(water_x);
                                        returnVariables.Add(water_y);
                                        wvalid = true;

                                    }
                                }
                            }
                            else{
                                returnVariables.Add(0);
                                returnVariables.Add(0);
                            }
                            for (int i = 0; i < ConfigReader.civilian_cluster_count; i++)
                            {
                                bool cvalid = false;
                                while (!cvalid)
                                {
                                    int civ_spawn_x = random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f);
                                    int civ_spawn_y = random.Next((int)(ConfigReader.map_size * 0.8f)) + (int)(ConfigReader.map_size * 0.1f);

                                    if (Math.Abs(civ_spawn_x - fire_x) > min_distance && Math.Abs(civ_spawn_y - fire_y) > min_distance)
                                    {
                                        Vector2 civ_spawn_location = new Vector2(civ_spawn_x, civ_spawn_y);
                                        Debug.Log("spawning civilians");
                                        mapManager.SpawnCivilians(ConfigReader.civilian_count, civ_spawn_location);
                                        returnVariables.Add((int)civ_spawn_location.x);
                                        returnVariables.Add((int)civ_spawn_location.y);
                                        cvalid = true;

                                    }
                                }
                            }
                        }
                    }
                    else
                    {
                        Debug.Log("invalid");
                    }

                }

                

            }
            else
            {
                Debug.Log("invalid game type");
            }

            Debug.Log("game set up");
        }


        private void OnServerStarted()
        {
            if (NetworkManager.Singleton.IsServer)
            {
                _transport = NetworkManager.Singleton.NetworkConfig.NetworkTransport as DojoTransport;
                Debug.Log("spawning agents");
                _agentManager.SpawnAgents(spawn_location);
                this.manager_agent = _agentManager.Agents[0];
                //mapManager.SpawnCivilians(20,4);

            }

        }
        private void OnClientAction(DojoMessage m)
        {
            if (!IsClient)
            {
                var action = m.GetString();
                if (Enum.TryParse(typeof(NetCommand), action, out var command))
                {
                    //_board.HandleClientControl((NetCommand)command);
                }
                else
                {
                    Debug.LogWarning($"Invalid remote action: {action}");
                }
            }
        }


        public void SaveHighResTexture(Texture2D original, int upscaleFactor, string savePath)
        {
            int newWidth = original.width * upscaleFactor;
            int newHeight = original.height * upscaleFactor;

            // if our cache is null or wrong size, rebuild it
            if (_highResCache == null || newWidth != _cacheWidth || newHeight != _cacheHeight)
            {
                if (_highResCache != null)
                    Destroy(_highResCache);

                _highResCache = new Texture2D(newWidth, newHeight, TextureFormat.RGBA32, false);
                _cacheWidth = newWidth;
                _cacheHeight = newHeight;
            }

            // copy pixels
            for (int y = 0; y < original.height; y++)
            {
                for (int x = 0; x < original.width; x++)
                {
                    Color c = original.GetPixel(x, y);
                    int baseX = x * upscaleFactor;
                    int baseY = (original.height - 1 - y) * upscaleFactor; // Flip Y coordinate
                    for (int dy = 0; dy < upscaleFactor; dy++)
                        for (int dx = 0; dx < upscaleFactor; dx++)
                            _highResCache.SetPixel(baseX + dx, baseY + dy, c);
                }
            }
            _highResCache.Apply();

            // encode & write
            byte[] bytes = _highResCache.EncodeToPNG();
            File.WriteAllBytes(savePath, bytes);
        }
        public void FixedUpdate()
        {
            if (!_connection.IsClient)
            {
                frame += 1;
                step = (int)(frame / (50 * tick_rate));

                if (step == max_steps && !_connection.IsClient)
                {
                    Debug.Log("Max Steps Reached");
                    EndGame();
                }


                //if (!fire_started)
                //{
                //    if(UnityEngine.Random.value < false_fire_chance)
                //    {
                //        mapManager.FalseFire(UnityEngine.Random.value, UnityEngine.Random.value);
                //    }


                //    if (startframes < 0 && UnityEngine.Random.value < ignition_chance)
                //    {
                //        fire_started = mapManager.SetRandomFire(UnityEngine.Random.value, UnityEngine.Random.value);
                //    }
                //    startframes -= 1;
                //}
                //else
                //{
                //    if (!mapManager.cellGrid.hasIgnitedCell)
                //    {
                //        Debug.Log("Fire Extinguished");
                //        EndGame();
                //    }
                //}


                
                playercontrollers =  new List<PlayerController>();
                foreach(PlayerController p in mapManager.firefighters)
                {
                    playercontrollers.Add(p);
                }
                foreach (PlayerController p in mapManager.bulldozers)
                {
                    playercontrollers.Add(p);
                }
                foreach (PlayerController p in mapManager.drones)
                {
                    playercontrollers.Add(p);
                }
                foreach (PlayerController p in mapManager.helicopters)
                {
                    playercontrollers.Add(p);
                }

                if (playercontrollers.Count > 0) {

                    // Margin from the starting roster's largest minimap range (-AccumulativeMargin),
                    // so e.g. firefighter-only games are not zoomed out to helicopter range.
                    ComputeCoveringSquare(playercontrollers, ConfigReader.accumulative_margin, out Vector3 center, out double squareSize);


                    serverCam.transform.position = center-new Vector3(0,100,0);
                    serverCam.orthographicSize = (0.5f * (float)squareSize) / MapManager.mapSize.x;
                    
                    if (((frame % frames_per_capture) ==0)&& ConfigReader.log_trajectory)
                    {
                        SaveRenders(frame / frames_per_capture);
                    }
                    CheckScore();


                }

            }
        }

        public static void ComputeCoveringSquare(List<PlayerController> points, double flatMargin, out Vector3 center, out double squareSize)
        {


            // Initialize min and max with the first point.
            double minX = points[0].transform.position.x;
            double maxX = points[0].transform.position.x;
            double minY = points[0].transform.position.z;
            double maxY = points[0].transform.position.z;

            // Find the bounding box.
            foreach (var p in points)
            {
                if (p.transform.position.x < minX) minX = p.transform.position.x;
                if (p.transform.position.x > maxX) maxX = p.transform.position.x;
                if (p.transform.position.z < minY) minY = p.transform.position.z;
                if (p.transform.position.z > maxY) maxY = p.transform.position.z;
            }

            // Calculate the midpoint of the bounding box.
            center = new Vector3((float)(minX + maxX) / (2f * MapManager.mapSize.x), (float)(minY + maxY) / (2f * MapManager.mapSize.y), -1f);

            // Determine the minimal required square size (the larger dimension of the bounding box).
            double width = maxX - minX;
            double height = maxY - minY;
            double minimalSquareSize = Math.Max(width, height);

            // Apply the flat margin: add margin on both sides.
            squareSize = minimalSquareSize + 2 * flatMargin;
        }

        public void SaveRenders(int step)
        {
            string folder = Path.Combine(
                            ConfigReader.render_folder_path,
                            $"wildfire_alg/results/logs/{ConfigReader.algorithm}/{ConfigReader.level}/{ConfigReader.seed}/{ConfigReader.team_generation_type}/{ConfigReader.timestamp}/Server_Map"
                        );
            if (!Directory.Exists(folder))
                Directory.CreateDirectory(folder);

            string filename = Path.Combine(folder, $"capture_{step}.png");

            // now this will reuse one big Texture2D and won't leak:
            SaveHighResTexture(mapManager.textureMap, 8, filename);
            // --- 1) Server accumulative capture ---
            if (_serverCaptureTex == null)
                _serverCaptureTex = new Texture2D(serverTexture.width, serverTexture.height, TextureFormat.RGB24, false);

            string baseFolder = Path.Combine(
                ConfigReader.render_folder_path,
                $"wildfire_alg/results/logs/{ConfigReader.algorithm}/{ConfigReader.level}/{ConfigReader.seed}/{ConfigReader.team_generation_type}/{ConfigReader.timestamp}"
            );
            Debug.Log(baseFolder);
            CaptureTextureToFile(
                serverTexture,
                _serverCaptureTex,
                Path.Combine(baseFolder, "Server_Accumulative"),
                step
            );

            // --- 2) Per-agent captures ---
            foreach (var p in playercontrollers)
            {
                // Minimap
                if (!_minimapCaptureTexs.TryGetValue(p, out var miniTex))
                {
                    miniTex = new Texture2D(p.minimapTexture.width, p.minimapTexture.height, TextureFormat.RGB24, false);
                    _minimapCaptureTexs[p] = miniTex;
                }
                CaptureTextureToFile(
                    p.minimapTexture,
                    miniTex,
                    Path.Combine(baseFolder, $"Agent_{p.agent.AgentId}/Minimap"),
                    step
                );

                // POV
                if (!_povCaptureTexs.TryGetValue(p, out var povTex))
                {
                    povTex = new Texture2D(p.povTexture.width, p.povTexture.height, TextureFormat.RGB24, false);
                    _povCaptureTexs[p] = povTex;
                }
                CaptureTextureToFile(
                    p.povTexture,
                    povTex,
                    Path.Combine(baseFolder, $"Agent_{p.agent.AgentId}/POV"),
                    step
                );
            }
        }


        private void CaptureTextureToFile(RenderTexture rt, Texture2D tex, string folderPath, int step)
        {

            RenderTexture.active = rt;
            tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
            tex.Apply();
            RenderTexture.active = null;


            byte[] bytes = tex.EncodeToJPG();
            if (!Directory.Exists(folderPath))
                Directory.CreateDirectory(folderPath);

            string filename = Path.Combine(folderPath, $"capture_{step}.png");
            File.WriteAllBytes(filename, bytes);
        }
        private void OnDestroy()
        {
            // free GPU memory
            if (_serverCaptureTex != null) Destroy(_serverCaptureTex);
            foreach (var kv in _minimapCaptureTexs) Destroy(kv.Value);
            foreach (var kv in _povCaptureTexs) Destroy(kv.Value);
        }

        public void CheckScore()
        {
            // [2] Exploration area
            returnVariables[2] = MapManager.view_cells_revealed;

            // [3] Trees destroyed by fire
            returnVariables[3] = MapManager.tree_destroyed_fire;

            // [4] Trees destroyed by agents
            returnVariables[4] = MapManager.tree_destroyed_agents;

            // [5] Fire extinguished by water
            returnVariables[5] = MapManager.fire_extinguished;

            // [6] Correct trees cut (CutTrees mode only)
            int correct_cut = 0;
            if (ConfigReader.game_type == GameType.CutTrees)
            {
                if (!ConfigReader.lines)
                {
                    // task params: [15]=lines, [16]=count, [17+]=coord pairs
                    for (int i = 17; i < returnVariables.Count; i += 2)
                    {
                        int tree_x = returnVariables[i];
                        int tree_y = returnVariables[i + 1];
                        Cell currCell = mapManager.cellGrid.grid[(int)tree_y][(int)tree_x];
                        if (currCell.trees != null)
                        {
                            correct_cut += (3 - currCell.trees.count);
                        }
                        // else: empty target cell -> no credit (keep polling)
                    }
                }
                else
                {
                    // task params: [15]=lines, [16]=count, [17+]=line quads
                    for (int i = 17; i < returnVariables.Count; i += 4)
                    {
                        int start_x = returnVariables[i];
                        int start_y = returnVariables[i + 1];
                        int end_x = returnVariables[i + 2];
                        int end_y = returnVariables[i + 3];

                        if (start_x == end_x) // Vertical line
                        {
                            int minY = Math.Min(start_y, end_y);
                            int maxY = Math.Max(start_y, end_y);
                            for (int y = minY; y <= maxY; y++)
                            {
                                Cell c = mapManager.cellGrid.grid[(int)y][(int)start_x];
                                correct_cut += (c.trees != null) ? (3 - c.trees.count) : 0;
                            }
                        }
                        else if (start_y == end_y) // Horizontal line
                        {
                            int minX = Math.Min(start_x, end_x);
                            int maxX = Math.Max(start_x, end_x);
                            for (int x = minX; x <= maxX; x++)
                            {
                                Cell c = mapManager.cellGrid.grid[(int)start_y][(int)x];
                                correct_cut += (c.trees != null) ? (3 - c.trees.count) : 0;
                            }
                        }
                    }
                }
            }
            returnVariables[6] = correct_cut;

            // [7] Civilians rescued (monotone increasing, must be on ground)
            if (ConfigReader.game_type == GameType.MoveCivilians || ConfigReader.game_type == GameType.Both)
            {
                int cx = returnVariables[15], cy = returnVariables[16];
                foreach (Civilian c in mapManager.civilians)
                {
                    if (c.alive && c.carrier == null &&
                        Math.Abs(cx - (int)c.gridPos.x) <= 4 &&
                        Math.Abs(cy - (int)c.gridPos.y) <= 4)
                    {
                        rescued_civilians.Add(c);
                        c.active = false;
                    }
                }
            }
            returnVariables[7] = rescued_civilians.Count;

            // [8] Firefighters transported (monotone increasing, must be on ground)
            if (ConfigReader.game_type == GameType.PickAndPlace)
            {
                int fx = returnVariables[15], fy = returnVariables[16];
                foreach (Firefighter f in mapManager.firefighters)
                {
                    if (f.active &&
                        Math.Abs(fx - f.gridPos.x) <= 3 &&
                        Math.Abs(fy - f.gridPos.y) <= 3)
                    {
                        transported_firefighters.Add(f);
                    }
                }
            }
            returnVariables[8] = transported_firefighters.Count;

            // [9] Civilians scouted
            returnVariables[9] = MapManager.scouted_civilians.Count;

            // [10] Fire scouted (concurrent agents currently seeing fire)
            returnVariables[10] = MapManager.current_fire_scouts;

            // [11] Water scouted
            returnVariables[11] = MapManager.scouted_water_positions.Count;

            // [12] Agents destroyed
            returnVariables[12] = MapManager.firefighters_destroyed + MapManager.bulldozers_destroyed;

            // [13] Civilians destroyed
            returnVariables[13] = MapManager.civilians_destroyed;

            // [14] Buildings destroyed
            returnVariables[14] = MapManager.buildings_destroyed;
        }

        private void EndGame()
        {

        }

        private void OnServerState(DojoMessage m)
        {
        }
        private void OnGameEvent(DojoMessage m)
        {

        }

        
        

    }
}

