using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using System;
using System.Linq;
using Unity.MLAgents;
using Unity.MLAgents.SideChannels;
using Unity.MLAgents.Sensors;
using Dojo;
using Unity.Netcode;

namespace Examples.Wildfire
{
    public class ConfigReader : MonoBehaviour
    {
        public MapManager map_manager;
        public GameManager game_manager;



        public static GameType game_type;
        public static int map_size;
        public static int seed;

        public static bool lines;
        public static int tree_count;
        public static int trees_per_line;

        public static int fire_spread_speed;
        public static bool water;

        public static int civilian_count;
        public static int civilian_cluster_count;
        public static int civilian_move_speed;
        public static string algorithm;
        public static string render_folder_path;
        public static string level;
        public static int vegetation_density_offset;
        public static string timestamp;
        public static string team_generation_type;
        public static bool log_trajectory;
        // Margin (grid units) around agents for the accumulative server camera.
        // Sent by Python as the largest minimap range in the starting roster.
        public static float accumulative_margin = 30f;


        void Awake()
        {
            

            map_manager = GetComponent<MapManager>();

#if UNITY_STANDALONE // && !UNITY_EDITOR

            var args = Environment.GetCommandLineArgs();
            fire_spread_speed = 100;
            civilian_move_speed = 100;
            vegetation_density_offset = 20;
            log_trajectory = false;


            for (var idx = 0; idx < args.Length; ++idx)
            {
                var arg = args[idx];

                if (arg.Equals("-MapSize") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var mapsize))
                {
                    map_size = mapsize;
                }
                if (arg.Equals("-Seed") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var see))
                {
                    seed = see;
                }
                if (arg.Equals("-GameType") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var gametype))
                {
                    game_type = (GameType)gametype;
                    Debug.Log("Game Type: " + gametype);
                }
                if (arg.Equals("-Lines") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var line))
                {
                    lines = Convert.ToBoolean(line);
                }
                if (arg.Equals("-TreeCount") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var treecount))
                {
                    tree_count = treecount;
                }
                if (arg.Equals("-TreesPerLine") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var treeperline))
                {
                    trees_per_line = treeperline;
                }
                
                if (arg.Equals("-FireSpreadSpeed") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var firespreadspeed))
                {
                    fire_spread_speed = firespreadspeed;
                }
                if (arg.Equals("-Water") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var wate))
                {
                    water = Convert.ToBoolean(wate);
                    Debug.Log(water);
                }
                if (arg.Equals("-CivilianCount") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var civiliancount))
                {
                    civilian_count = civiliancount;
                }
                if (arg.Equals("-CivilianClusters") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var civilianclusters))
                {
                    civilian_cluster_count = civilianclusters;
                }
                
                if (arg.Equals("-CivilianMovingSpeed") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var civilianmovespeed))
                {
                    civilian_move_speed = civilianmovespeed;
                }
                if (arg.Equals("-Algorithm") && idx < args.Length - 1)
                {
                    algorithm = args[idx + 1];
                }
                if (arg.Equals("-RenderFolderPath") && idx < args.Length - 1)
                {
                    render_folder_path = args[idx + 1];
                }
                if (arg.Equals("-AccumulativeMargin") && idx < args.Length - 1 && float.TryParse(args[idx + 1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var accMargin))
                {
                    accumulative_margin = accMargin;
                }
                if (arg.Equals("-Level") && idx < args.Length - 1)
                {
                    level = args[idx + 1];
                }
                if (arg.Equals("-VegetationDensityOffset") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var offset))
                {
                    vegetation_density_offset = offset;
                }
                if (arg.Equals("-Timestamp") && idx < args.Length - 1)
                {
                    timestamp = args[idx + 1];
                }
                if (arg.Equals("-TeamGenerationType") && idx < args.Length - 1)
                {
                    team_generation_type = args[idx + 1];
                }
                if (arg.Equals("-LogTrajectory") && idx < args.Length - 1 && int.TryParse(args[idx + 1], out var logTraj))
                {
                    if (logTraj == 1)
                    {
                        log_trajectory = true;
                    }
                }

            }
#endif

            //map_size = 100;
            //seed = 598433;
            //game_type = GameType.MoveCivilians;
            //lines = false;
            //tree_count = 6;
            //trees_per_line = 1;
            //level = "demo_level";
            //render_folder_path = "";
            //algorithm = "demo";

            //civilian_count = 6;
            //civilian_move_speed = 200;
            //civilian_cluster_count = 1;
            //fire_spread_speed = 400;
            //water = true;


        }

    }
}