using UnityEngine;
using System.Collections;
using System;
using System.Threading;
using System.Collections.Generic;
using System.Linq;
using UnityEngine.UI;
using System.IO;
using Dojo;

using Unity.Netcode;

namespace Examples.Wildfire
{
	public class MapManager : NetworkBehaviour
	{
		public static Vector2 mapSize;
		public static int chunkSize = 10;
		public float meshHeightMultiplier;
		public GameManager game_manager;

		[SerializeField]
		public TerrainType[] regions;
		protected DojoConnection Connection;


		public CellGrid cellGrid;
		public MapData mapData;
		public MeshData meshData;
		public int[,] AccDataMap;
		public Color[] AccColorMap;
		public Texture2D AccTexture;
		


		public Mesh mesh;
		public Texture2D textureMap;
		public MeshFilter meshFilter;
		public MeshRenderer meshRenderer;
		public MeshCollider meshCollider;


		public Tree[,] treeMap;
		public GameObject[,] buildingsMap;


		public GameObject treePrefab1;
		public GameObject treePrefab2;
		public GameObject treePrefab3;
		public GameObject buildingPrefab;
		public GameObject civilianPrefab;
		public GameObject firePrefab;


		public GameObject[] folders = new GameObject[3];
		public HashSet<int>[,] chunkMap;
		public bool[,] chunkLoadMap;
		public static int chunkDim;

		public static float thresh_up = 10f;
		public static float thresh_down = 0.5f;
		public static float thresh_wind = -0.99f;
		public static float R_0 = 1f;
		public static float moisture_constant;
		public static int drying_time;
		public static int vulnerability_range;
		public static int false_fire_duration;


		public RawImage AccMapimg;



		public static int civilian_count;
		public static int civilian_groups;

		public List<Civilian> civilians;
		public List<Firefighter> firefighters;
		public List<Bulldozer> bulldozers;
		public List<Drone> drones;
		public List<Helicopter> helicopters;

		public static int[] viewRanges = new int[6] { 5, 5, 15, 20, 0, 0};
		public static float[] miniMapRanges = new float[6] { 10f, 10f, 25f, 30f, 0f, 0f};

		public GameObject mapSpritePrefab;
		public List<GameObject> mapSprites;

		public List<(GameObject, int)> falseFires = new List<(GameObject, int)>();


		public static int tree_destroyed = 0;
		public static int buildings_destroyed = 0;
		public static int civilians_destroyed = 0;
		public static int firefighters_destroyed = 0;
		public static int bulldozers_destroyed = 0;

		// Multi-dimensional reward tracking
		public static int tree_destroyed_fire = 0;
		public static int tree_destroyed_agents = 0;
		public static int fire_extinguished = 0;
		public static int view_cells_revealed = 0;
		public static int current_fire_scouts = 0;
		public static bool[,] cell_ever_revealed;
		public static HashSet<(int, int)> scouted_water_positions = new HashSet<(int, int)>();
		public static HashSet<Civilian> scouted_civilians = new HashSet<Civilian>();
		public static bool fire_active = false;


		public HashSet<Cell> watered;

		public int simulationSteps = 0;
		public int frames = 0;
		public int framesPerStep;


		private Color wet_color = new Color(130f/255, 180f/255, 220f/255);
		public Canvas _canvas;


		// Saving all actions done on server to sync a late joining client
		// start fire, false fire, simstep, cut tree, spray tree
		public List<float[]> ServerActionQueue = new List<float[]>();

		private bool accumulativeUpdated = false;

		public void Start()
		{
			framesPerStep = ConfigReader.fire_spread_speed;
			mapSize.x = ConfigReader.map_size;
			mapSize.y = ConfigReader.map_size;
			meshHeightMultiplier = 6;
			//meshHeightMultiplier = 25f;
			Connection = FindObjectOfType<DojoConnection>();
			// Higher constant -> Less influence
			moisture_constant = 10;

			// Range at which fire can spread to buildings
			vulnerability_range = 2;

			watered = new HashSet<Cell>();
			drying_time = 25;

            if (ConfigReader.map_size % 2 == 0)
            {
				this.transform.position = new Vector3(0.5f, 0, -0.5f);
            }


			regions = new TerrainType[6]{
				new TerrainType("dense forest", 0, new Color(8f/255, 66f/255, 24f/ 255), true, 3),//4
				new TerrainType("light forest", 1, new Color(88f/255, 128f/255, 61f/255), true, 1),//2
				new TerrainType("medium forest", 2, new Color(23f/255, 97f/255, 37f/255), true, 2),//3
				new TerrainType("rocks", 3, new Color(180f/255, 180f/255, 180f/255), false, 0),//0
				new TerrainType("brush", 4, new Color(120f/255, 150f/255, 120f/255), false, 0),//1
				new TerrainType("water", 5, new Color(100f/255, 120f/255, 220f/255), false, 0),
			};

			Debug.Log("drawing map start");
			DrawMapInEditor();

			
			//civilians = SpawnCivilians(civilian_count, civilian_groups);

			//4,2,3,0,1


			
			mapData.toggleColor = true;
			mapData.SwitchColor();
			textureMap = TextureFromColourMap(mapData.colourMap, (int)mapSize.x, (int)mapSize.y);
			textureMap.filterMode = FilterMode.Point;
			meshRenderer.material.mainTexture = textureMap;
			if (!Connection.IsClient)
			{
				game_manager.SetUpGame();
			}


			AccDataMap = new int[(int)mapSize.x, (int)mapSize.y];
			AccColorMap = new Color[(int)mapSize.x * (int)mapSize.y];
			for (int i = 0; i< (int)mapSize.x * (int)mapSize.y; i++)
            {
				AccColorMap[i] = new Color(0, 0, 0);
			}

			// Initialize reward tracking state
			cell_ever_revealed = new bool[(int)mapSize.x, (int)mapSize.y];
			scouted_water_positions = new HashSet<(int, int)>();
			scouted_civilians = new HashSet<Civilian>();
			view_cells_revealed = 0;
			current_fire_scouts = 0;
			tree_destroyed_fire = 0;
			tree_destroyed_agents = 0;
			fire_extinguished = 0;


			chunkDim = (int)Math.Ceiling(mapSize.x / chunkSize);
			chunkMap = new HashSet<int>[chunkDim,chunkDim];
			chunkLoadMap = new bool[chunkDim, chunkDim];
			AccTexture = new Texture2D((int)mapSize.x, (int)mapSize.y);
			AccTexture.wrapMode = TextureWrapMode.Clamp;
			AccTexture.filterMode = FilterMode.Point;

			AccMapimg.texture = AccTexture;

			mapSprites = new List<GameObject>();
            NetworkManager.Singleton.OnClientConnectedCallback += Singleton_OnClientConnectedCallback;
			false_fire_duration = 30;
		}

        private void Singleton_OnClientConnectedCallback(ulong obj)
        {
            if (!Connection.IsClient)
            {
				Debug.Log("test");
				Debug.Log(obj);


				ClientRpcParams clientRpcParams = new ClientRpcParams
				{
					Send = new ClientRpcSendParams
					{
						TargetClientIds = new ulong[] { obj }
					}
				};


				
				foreach(float[] action in ServerActionQueue)
                {
					SendSyncServerActionQueueClientRpc(action, clientRpcParams);

				}
			
				//SendSyncServerActionQueueClientRpc(actionArray, AccDataMap, AccColorMap, clientRpcParams);
			}

		}

		

		[ClientRpc]
		public void SendSyncServerActionQueueClientRpc(float[] action, ClientRpcParams c = default)
		{
            switch (action[0])
            {
				case 0f:
					SetFire(action[1], action[2]);
					break;
				case 1f:
					FalseFire(action[1], action[2]);
					break;
				case 2f:
					SimStep();
					break;
				case 3f:
					CutTree(new Vector2(action[1], action[2]), (action[3]==1f));
					break;
				case 4f:
					SprayWater(new Vector2(action[1], action[2]), (int)action[3], action[4], new Vector2(action[5], action[6]));
					break;
				case 5f:
					RemoveWater(new Vector2(action[1], action[2]));
					break;
				default:
					Debug.Log("Invalid Action");
					break;
            }
		}
		public void SimStep()
        {
			//Debug.Log("Sim running");
			cellGrid.Simulate();
			fire_active = cellGrid.hasIgnitedCell;
			simulationSteps += 1;

			for (int i = 0, x = 0; x < cellGrid.grid.Count; x++)
			{
				for (int y = 0; y < cellGrid.grid[0].Count; y++)
				{
					switch (cellGrid.grid[x][y].state)
					{
						case CellState.ignited:

							mapData.colourMap[i] = new Color(220f / 255, 47f / 255, 2f / 255);
							break;

						case CellState.on_fire:
							mapData.colourMap[i] = new Color(208f / 255, 0f / 255, 0f / 255);
							break;

						case CellState.extenguishing:
							mapData.colourMap[i] = new Color(255f / 255, 186f / 255, 8f / 255);
							break;

						case CellState.fully_extenguished:
							mapData.colourMap[i] = new Color(22f / 255, 26f / 255, 29f / 255);
							break;
					}

					i++;
				}
			}

			textureMap.SetPixels(mapData.colourMap);
			textureMap.Apply();
			meshRenderer.material.mainTexture = textureMap;

			//Debug.Log($"{tree_destroyed} trees destroyed, {buildings_destroyed} buildings destroyed, {civilians_destroyed} civilians destroyed");

			// Drying all wet cells
			List<Cell> cells_removing = new List<Cell>();
			foreach(Cell c in watered)
            {
                if (c.wet > 0)
                {
					c.wet -= 1;
                }
                if (c.wet == 0)
                {
					int texture_coordinate = ((int)c.x * (int)mapSize.x) + (int)c.y;
					mapData.colourMap[texture_coordinate] = c.hidden_color;
					cells_removing.Add(c);
				}
            }
			foreach(Cell c in cells_removing)
            {
				watered.Remove(c);
            }

			// Updating all False-Fires
			List<(GameObject, int)> new_falseFires = new List<(GameObject, int)>();
			foreach ((GameObject,int) false_fire in falseFires)
            {
                if (false_fire.Item2 == 1)
                {
					GameObject.Destroy(false_fire.Item1);
                }
                else
                {
					new_falseFires.Add((false_fire.Item1, false_fire.Item2 - 1));
                }
            }
			falseFires = new_falseFires;
			UpdateAccumulativeView();
			if (!Connection.IsClient)
            {
				SimStepClientRpc();
				ServerActionQueue.Add(new float[1] { 2 });

			}

		}

        public void Update()
        {
            if (!Connection.IsClient)
            {
				return;

				if (Input.GetKeyDown(KeyCode.O))
				{

					SimStep();
                }
                if (Input.GetKeyDown(KeyCode.I))
                {
                    for (int i = 0; i < 30; i++)
                    {

                        SimStep();
                    }
                }

            }


        }
        public void FixedUpdate()
        {
            if (!Connection.IsClient)
            {
				frames += 1;

				if (frames % framesPerStep == 0)
				{
					SimStep();

				}
			}
			//UpdateSprites();
            if (accumulativeUpdated == true)
            {
				accumulativeUpdated = false;
            }
		}


		/*
		 * 0: empty
		 * 1: wet 0
		 * 2: wet 1
		 * 3: wet 2
		 * 4: wet 3
		 * 5: 0
		 * 6: 1
		 * 7: 2
		 * 8: 3
		 * 9: ignited
		 * 10: on fire
		 * 11: extinguishing
		 * 12: extinguished
		 */


		public void UpdateAccumulativeView()
        {
			foreach (Civilian c in this.civilians)
            {
				c.seen = false;
            }
			if (accumulativeUpdated == false)
            {
				current_fire_scouts = 0;

				foreach (Firefighter f in firefighters)
				{
					UpdateSingleAgentView((int)f.gridPos.x, (int)f.gridPos.y, viewRanges[0]);
				}
				foreach (Bulldozer b in bulldozers)
				{
					UpdateSingleAgentView((int)b.gridPos.x, (int)b.gridPos.y, viewRanges[1]);
				}
				foreach (Drone d in drones)
				{
					UpdateSingleAgentView((int)d.gridPos.x, (int)d.gridPos.y, viewRanges[2]);
				}
				foreach (Helicopter h in helicopters)
				{
					UpdateSingleAgentView((int)h.gridPos.x, (int)h.gridPos.y, viewRanges[3]);
				}

				AccTexture.SetPixels(AccColorMap);
				AccTexture.Apply();
			}

		}
		public void UpdateSingleAgentView(int x, int y, int range)
        {
			bool agentSeenFire = false;

			for (int i = x - range; i < x + range + 1; i++)
			{

				for (int j = y - range; j < y + range + 1; j++)
				{

					if (i < 0 || i >= mapSize.x || j < 0 || j >= mapSize.x)
					{
						continue;

					}

					Cell currCell = cellGrid.grid[j][i];
					int celltype = 1;
					switch (currCell.state)
					{
						case CellState.burnable:
						case CellState.not_burnable:
							if (currCell.wet == 0)
							{
								celltype += 4;
							}
							if (currCell.trees != null && currCell.trees.count != 0)
							{
								celltype += currCell.trees.count;
							}
							if (currCell.land_type == 5)
                            {
								celltype = 13;
                            }
							break;
						case CellState.ignited:
							celltype = 9;
							break;
						case CellState.on_fire:
							celltype = 10;
							break;
						case CellState.extenguishing:
							celltype = 11;
							break;
						case CellState.fully_extenguished:
							celltype = 12;
							break;
					}
					if (this.mapData.buildingsMap[j, i] > 0)
                    {
						// Building
						celltype = 14;
                    }
					foreach (Civilian c in this.civilians)
					{
						if ((int)c.gridPos.y == j&&(int)c.gridPos.x == i)
                        {
							c.seen=true;
							celltype = 15;
							scouted_civilians.Add(c);
						}

					}

					// Exploration tracking
					if (!cell_ever_revealed[i, j])
					{
						cell_ever_revealed[i, j] = true;
						view_cells_revealed++;
					}
					// Fire scouting (concurrent - does this agent see fire?)
					if (!agentSeenFire &&
					    (currCell.state == CellState.on_fire || currCell.state == CellState.ignited ||
					     currCell.state == CellState.extenguishing || currCell.state == CellState.fully_extenguished))
					{
						agentSeenFire = true;
					}
					// Water scouting (cumulative)
					if (currCell.land_type == 5)
					{
						scouted_water_positions.Add((i, j));
					}

					AccDataMap[i, j] = celltype;
					int texture_coordinate = (j * (int)mapSize.x) + i;
					AccColorMap[texture_coordinate] = mapData.colourMap[texture_coordinate];
				}
			}
			if (agentSeenFire) current_fire_scouts++;

		}

		public void UpdateSprites()
        {
			int sprite_count = firefighters.Count + bulldozers.Count + drones.Count + helicopters.Count;


			while (mapSprites.Count != sprite_count)
			{
				if (sprite_count > mapSprites.Count)
				{
					GameObject s = Instantiate<GameObject>(mapSpritePrefab, new Vector3(0,0,0),Quaternion.identity, _canvas.transform);
					mapSprites.Add(s);
				}
				else
				{
					mapSprites.RemoveAt(0);
				}
			}

			//int sprite_index = 0;

			//for(int i = sprite_index; i<sprite_index+firefighters.Count; i++)
   //         {
			//	mapSprites[i].transform.position = new Vector3((firefighters[i].transform.position.x-0.5f)/mapSize.x, (firefighters[i].transform.position.z + 0.5f) / mapSize.y, -0.1f);
			//	mapSprites[i].transform.eulerAngles = new Vector3(0, 0, -firefighters[i].transform.eulerAngles.y);
   //         }
			//sprite_index += firefighters.Count;
			//for (int i = sprite_index; i < sprite_index + bulldozers.Count; i++)
			//{
			//	mapSprites[i].transform.position = new Vector3((bulldozers[i-sprite_index].transform.position.x - 0.5f) / mapSize.x, (bulldozers[i - sprite_index].transform.position.z + 0.5f) / mapSize.y, -0.1f);
			//	mapSprites[i].transform.eulerAngles = new Vector3(0, 0, -bulldozers[i - sprite_index].transform.eulerAngles.y);
			//}
			//sprite_index += bulldozers.Count;
			//for (int i = sprite_index; i < sprite_index + drones.Count; i++)
			//{
			//	mapSprites[i].transform.position = new Vector3((drones[i - sprite_index].transform.position.x - 0.5f) / mapSize.x, (drones[i - sprite_index].transform.position.z + 0.5f) / mapSize.y, -0.1f);
			//	mapSprites[i].transform.eulerAngles = new Vector3(0, 0, -drones[i - sprite_index].transform.eulerAngles.y);
			//}
			//sprite_index += drones.Count;
			//for (int i = sprite_index; i < sprite_index + helicopters.Count; i++)
			//{
			//	mapSprites[i].transform.position = new Vector3((helicopters[i - sprite_index].transform.position.x - 0.5f) / mapSize.x, (helicopters[i - sprite_index].transform.position.z + 0.5f) / mapSize.y, -0.1f);
			//	mapSprites[i].transform.eulerAngles = new Vector3(0, 0, -helicopters[i - sprite_index].transform.eulerAngles.y);
			//}

			

		}



        [ClientRpc]
		void SetFireClientRpc(float randx, float randy)
        {
			SetFire(randx, randy);
        }

		[ClientRpc]
		void SimStepClientRpc()
        {
			SimStep();
        }
		public bool SetFire(float x, float y)
		{


			bool valid = cellGrid.SetFire((int)y, (int)x);
			Debug.Log("fire start " + valid);

            if (!Connection.IsClient)
            {
                SetFireClientRpc(x, y);
				ServerActionQueue.Add(new float[3] { 0, x, y });


			}
			return valid;
		}

        public void FalseFire(float randx, float randy)
        {
			float topLeftX = (mapSize.x - 1) / -2f + 0.5f;
			float topLeftZ = (mapSize.y - 1) / 2f - 0.5f;


			int x = (int)(randx * mapSize.x);
			int y = (int)(randy * mapSize.x);

			Cell currCell = cellGrid.grid[y][x];
			if(currCell.state == CellState.burnable || currCell.state == CellState.not_burnable)
            {
				GameObject false_fire = Instantiate<GameObject>(firePrefab, new Vector3(topLeftX + x, this.mapData.elevationMap[y, x] * this.meshHeightMultiplier, topLeftZ - y), Quaternion.Euler(-90, 0, 0), folders[3].transform);
				falseFires.Add((false_fire, false_fire_duration));
			}
            if (!Connection.IsClient)
            {
				FalseFireClientRpc(randx, randy);
				ServerActionQueue.Add(new float[3] { 1, randx, randy });
			}
		}

		[ClientRpc]
		public void FalseFireClientRpc(float randx, float randy)
        {
			FalseFire(randx, randy);
        }
		public void DrawMapInEditor()
		{
			Debug.Log("drawing map");
			mapData = GenerateMapData(true);
			meshData = GenerateTerrainMesh(mapData.elevationMap, meshHeightMultiplier, 0);
			textureMap = TextureFromColourMap(mapData.colourMap, (int)mapSize.x, (int)mapSize.y);
			mesh = meshData.CreateMesh();
			DrawMesh(mesh, textureMap);
			this.treeMap = SpawnTrees(mapData, meshHeightMultiplier, 0);
			this.buildingsMap = SpawnBuildings(mapData, meshHeightMultiplier, 0);
			this.cellGrid = new CellGrid(this, mapData.vegetationMap, mapData.elevationMap, mapData.moistureMap,
							 mapData.windXMap, mapData.windZMap, treeMap, mapData.buildingsMap, this.buildingsMap);
			meshCollider.sharedMesh = mesh;
			Debug.Log("drawn map done");

		}

		public static (float[,] elevationMap, float[,] moistureMap, int[,] vegetationMap, int[,] buildingMap, float[,] windXMap, float[,] windYMap)
		GenerateTerrainMaps(int size, int seed, float constantX)
		{
			System.Random random = new System.Random(seed);

			// Elevation Map
			float[,] elevationNoise = GeneratePerlinNoise(size, size, 100f, 4, 0.5f, 2f, seed);
			float[,] elevationMap = TransformNoiseToRange(elevationNoise, 0, 1);

			// Moisture Map
			float[,] moistureNoise = GeneratePerlinNoise(size, size, 100f, 2, 0.5f, 2f, seed + 1);
			float[,] moistureMap = TransformNoiseToRange(moistureNoise, 0.4f, 0.8f);

			// Vegetation Map
			float[,] vegetationNoise = GeneratePerlinNoise(size, size, 20f, 4, 0.5f, 2f, seed + 2);
			int[,] vegetationMap = new int[size, size];
			for (int i = 0; i < size; i++)
			{
				for (int j = 0; j < size; j++)
				{
					float value = vegetationNoise[i, j] + constantX * 0.01f; // Shift distribution based on constantX
					vegetationMap[i, j] = (int)Math.Clamp(Math.Round(value * 2.5f + 2), 0, 4); // Scale and clamp to [0, 4]
				}
			}

			// Building Map
			int[,] buildingMap = new int[size, size];
			for (int i = 0; i < size; i++)
			{
				for (int j = 0; j < size; j++)
				{
					if (vegetationMap[i, j] == 0 && random.NextDouble() < 0.05) // 1% chance to place a building
					{
						buildingMap[i, j] = 1;
						// Create small clumps of buildings
						for (int di = -1; di <= 1; di++)
						{
							for (int dj = -1; dj <= 1; dj++)
							{
								if (i + di >= 0 && i + di < size && j + dj >= 0 && j + dj < size && random.NextDouble() < 0.5)
								{
									buildingMap[i + di, j + dj] = 1;
								}
							}
						}
					}
				}
			}

			// Wind Maps
			float[,] windXNoise = GeneratePerlinNoise(size, size, 2000f, 4, 0.5f, 2f, seed + 3);
			float[,] windXMap = TransformNoiseToRange(windXNoise, -10, 10);
			float[,] windYNoise = GeneratePerlinNoise(size, size, 200f, 4, 0.5f, 2f, seed + 4);
			float[,] windYMap = TransformNoiseToRange(windYNoise, -10, 10);

			return (elevationMap, moistureMap, vegetationMap, buildingMap, windXMap, windYMap);
		}

		private static float[,] GeneratePerlinNoise(int width, int height, float scale, int octaves, float persistence, float lacunarity, int seed)
		{
			float[,] noiseMap = new float[width, height];
			System.Random rand = new System.Random(seed);
			float maxNoise = float.MinValue;
			float minNoise = float.MaxValue;

			// Generate octave offsets
			float[] offsetX = new float[octaves];
			float[] offsetY = new float[octaves];
			for (int i = 0; i < octaves; i++)
			{
				offsetX[i] = rand.Next(-100000, 100000);
				offsetY[i] = rand.Next(-100000, 100000);
			}

			if (scale <= 0) scale = 0.0001f;

			for (int y = 0; y < height; y++)
			{
				for (int x = 0; x < width; x++)
				{
					float amplitude = 1;
					float frequency = 1;
					float noiseHeight = 0;

					for (int i = 0; i < octaves; i++)
					{
						float sampleX = (x + offsetX[i]) / scale * frequency;
						float sampleY = (y + offsetY[i]) / scale * frequency;

						float perlinValue = Mathf.PerlinNoise(sampleX, sampleY) * 2 - 1; // Normalize to [-1,1]
						noiseHeight += perlinValue * amplitude;

						amplitude *= persistence;
						frequency *= lacunarity;
					}

					maxNoise = Math.Max(maxNoise, noiseHeight);
					minNoise = Math.Min(minNoise, noiseHeight);

					noiseMap[x, y] = noiseHeight;
				}
			}

			// Normalize values to range [-1,1]
			for (int y = 0; y < height; y++)
			{
				for (int x = 0; x < width; x++)
				{
					noiseMap[x, y] = Mathf.InverseLerp(minNoise, maxNoise, noiseMap[x, y]) * 2 - 1;
				}
			}

			return noiseMap;
		}

		private static float[,] TransformNoiseToRange(float[,] noiseMap, float min, float max)
		{
			int width = noiseMap.GetLength(0);
			int height = noiseMap.GetLength(1);
			float[,] transformedMap = new float[width, height];

			for (int y = 0; y < height; y++)
			{
				for (int x = 0; x < width; x++)
				{
					transformedMap[x, y] = Mathf.Lerp(min, max, (noiseMap[x, y] + 1) / 2); // Map [-1,1] to [min,max]
				}
			}

			return transformedMap;
		}
		public static int[,] SwapValuesInMap(int[,] map, Dictionary<int, int> valueMapping)
		{
			int width = map.GetLength(0);
			int height = map.GetLength(1);
			int[,] swappedMap = new int[width, height];

			for (int y = 0; y < height; y++)
			{
				for (int x = 0; x < width; x++)
				{
					int currentValue = map[x, y];
					// Use the mapping if the current value exists in the dictionary, otherwise keep the original value
					swappedMap[x, y] = valueMapping.ContainsKey(currentValue) ? valueMapping[currentValue] : currentValue;
				}
			}

			return swappedMap;
		}
		public MapData GenerateMapData(bool custom)
		{


			if (custom)
            {

				Color[] rgbMap = new Color[ConfigReader.map_size * ConfigReader.map_size];
				for (int i = 0; i < rgbMap.Length; i++)
				{
					rgbMap[i] = Color.black;
				}


				var maps = GenerateTerrainMaps(ConfigReader.map_size, ConfigReader.seed, ConfigReader.vegetation_density_offset);
				Debug.Log("generated terrain maps");

				// Unpack the maps
				float[,] elevationMap = maps.elevationMap;
				float[,] moistureMap = maps.moistureMap;
				int[,] vegetationMap = maps.vegetationMap;
				int[,] buildingMap = maps.buildingMap;
				float[,] windXMap = maps.windXMap;
				float[,] windYMap = maps.windYMap;
				//4,2,3,0,1



				

				Dictionary<int, int> valueMapping = new Dictionary<int, int>
				{
					{ 4, 0 },
					{ 2, 1},
					{3, 2 },
					{ 0, 3 },
					{1,4 }
				};




				vegetationMap = SwapValuesInMap(vegetationMap, valueMapping);


				//4 to 6
				//0 to 4
				//3 to 0
				//2 to 3
				//1 to 2
				//6 to 1



				//WriteMapToFile(elevationMap, "maps/elevation.txt");
				//WriteMapToFile(moistureMap, "maps/moisture.txt");

				//int rows = buildingMap.GetLength(0);
				//int cols = buildingMap.GetLength(1);
				//float[,] buildingFloatArray = new float[rows, cols];

				//for (int i = 0; i < rows; i++)
				//	for (int j = 0; j < cols; j++)
				//		buildingFloatArray[i, j] = buildingMap[i, j];
				//WriteMapToFile(buildingFloatArray, "maps/building.txt");
				//WriteMapToFile(windXMap, "maps/windx.txt");
				//WriteMapToFile(windYMap, "maps/windy.txt");

				return new MapData(elevationMap, vegetationMap, moistureMap, windXMap, windYMap, rgbMap, buildingMap, this.regions);

			}
			else
			{

				string heights_path = "/Resources/elevation/" + "cali"
																	  + ".txt";

				float[,] heightMap = FileReader.Array2DFromFile<float>(heights_path, mapSize);


				string vegetation_path = "/Resources/vegetation/" + "cali"
																 + ".txt";

				int[,] vegetationMap = FileReader.Array2DFromFile<int>(vegetation_path, mapSize);


				string moisture_path = "/Resources/moisture/" + "cali"
																	   + ".txt";

				float[,] moistureMap = FileReader.Array2DFromFile<float>(moisture_path, mapSize);


				string wind_x_path = "/Resources/wind_x/" + "cali"
																	   + ".txt";

				float[,] windXMap = FileReader.Array2DFromFile<float>(wind_x_path, mapSize);


				string wind_z_path = "/Resources/wind_z/" + "cali"
																	   + ".txt";

				float[,] windZMap = FileReader.Array2DFromFile<float>(wind_z_path, mapSize);

				string r_path = "/Resources/RGB/R/" + "cali"
																	  + ".txt";

				string g_path = "/Resources/RGB/G/" + "cali"
																	  + ".txt";

				string b_path = "/Resources/RGB/B/" + "cali"
																	  + ".txt";

				string buildings_path = "/Resources/buildings/" + "cali"
														  + ".txt";

				int[,] buildingsMap = FileReader.Array2DFromFile<int>(buildings_path, mapSize);


				//Debug.Log("making color map");
				Color[] rgbMap = FileReader.ColorsFromRGBFiles(r_path, g_path, b_path, mapSize);
				//Debug.Log("made color map done");
				//Debug.Log("imported map data done");

				return new MapData(heightMap, vegetationMap, moistureMap, windXMap, windZMap, rgbMap, buildingsMap, this.regions);

			}

			
		}

		public void WriteMapToFile(float[,] elevationMap, string filePath)
		{
			int rows = elevationMap.GetLength(0);
			int cols = elevationMap.GetLength(1);

			using (StreamWriter writer = new StreamWriter(filePath))
			{
				for (int i = 0; i < rows; i++)
				{
					for (int j = 0; j < cols; j++)
					{
						writer.Write(elevationMap[i, j].ToString("F2"));
						if (j < cols - 1)
							writer.Write(", ");
					}
					writer.WriteLine();
				}
			}

			Debug.Log($"map written to {filePath}");
		}
		public MeshData GenerateTerrainMesh(float[,] heightMap, float heightMultiplier, int levelOfDetail)
		{

			int width = heightMap.GetLength(0);
			int height = heightMap.GetLength(1);
			//Debug.Log("width: " + width);
			//Debug.Log("height: " + height);
			float topLeftX = (width - 1) / -2f;
			float topLeftZ = (height - 1) / 2f;

			int meshSimplificationIncrement = (levelOfDetail == 0) ? 1 : levelOfDetail * 2;
			int verticesPerLine = (height - 1) / meshSimplificationIncrement + 1;

			MeshData meshData = new MeshData(verticesPerLine, verticesPerLine);
			int vertexIndex = 0;

			//Debug.Log("generating mesh");

			for (int y = 0; y < height; y += meshSimplificationIncrement)
			{

				for (int x = 0; x < width; x += meshSimplificationIncrement)
				{

					meshData.vertices[vertexIndex] = new Vector3(topLeftX + x, heightMap[y, x] * heightMultiplier, topLeftZ - y);
					meshData.uvs[vertexIndex] = new Vector2(x / (float)width, y / (float)height);

					if (x < width - 1 && y < height - 1)
					{
						meshData.AddTriangle(vertexIndex, vertexIndex + verticesPerLine + 1, vertexIndex + verticesPerLine);
						meshData.AddTriangle(vertexIndex + verticesPerLine + 1, vertexIndex, vertexIndex + 1);

					}

					vertexIndex++;
				}
			}
			//Debug.Log("generated mesh done");
			return meshData;

		}
		public static Texture2D TextureFromColourMap(Color[] colourMap, int width, int height)
		{
			//Debug.Log("generating texture");
			Texture2D texture = new Texture2D(width, height);
			texture.filterMode = FilterMode.Point;
			texture.wrapMode = TextureWrapMode.Clamp;

			texture.SetPixels(colourMap);
			texture.Apply();
			//Debug.Log("generated texture done");
			return texture;
		}
		public void DrawMesh(Mesh mesh, Texture2D texture)
		{
			meshFilter.mesh = mesh;
			meshRenderer.material.mainTexture = texture;
		}
		public Tree[,] SpawnTrees(MapData map, float heightMultiplier, int levelOfDetail)
		{
			
			int width = (int)MapManager.mapSize.x;
			int height = map.elevationMap.GetLength(1);
			float topLeftX = (width - 1) / -2f+0.5f;
			float topLeftZ = (height - 1) / 2f-0.5f;
			int meshSimplificationIncrement = (levelOfDetail == 0) ? 1 : levelOfDetail * 2;

			int vertexIndex = 0;

			//Debug.Log("generating trees");
			//Debug.Log(meshSimplificationIncrement);
			Tree[,] trmap = new Tree[width, height];

			for (int y = 0; y < height; y += meshSimplificationIncrement)
			{

				for (int x = 0; x < width; x += meshSimplificationIncrement)
				{
					int vege = map.vegetationMap[y, x];
					int tree_count = regions[vege].trees;

					if (tree_count > 0 && map.buildingsMap[y, x] == 0)
					{
						Tree tree = new Tree(tree_count);
						trmap[y, x] = tree;
					}
					vertexIndex++;
                }
            }
            //Debug.Log("generated trees done");
			return trmap;
        }
		public void RefreshChunk(int x, int y)
        {
			if (chunkMap[x,y].Count>0 && !chunkLoadMap[x,y])
            {
				float topLeftX = (mapSize.x - 1) / -2f + 0.5f;
				float topLeftZ = (mapSize.y - 1) / 2f - 0.5f;

				if (ConfigReader.map_size % 2 == 0)
				{
					topLeftX += 0.5f;
					topLeftZ -= 0.5f;
				}
				for (int i = 0; i < chunkSize; i++)
                {
					for (int j = 0; j< chunkSize; j++)
                    {

						int xgrid = j + (x * chunkSize);
						int ygrid = i + (y * chunkSize);

						Tree tree = treeMap[ygrid, xgrid];

						if (tree!= null && tree.count>0)
                        {
							GameObject prefab = tree.count switch
							{
								1 => treePrefab1,
								2 => treePrefab2,
								3 => treePrefab3,
								_ => new GameObject(),
							};
							tree.generateMesh(folders[0].transform, prefab, new Vector3(topLeftX + xgrid, this.mapData.elevationMap[ygrid, xgrid] * this.meshHeightMultiplier, topLeftZ - ygrid), Quaternion.identity);
						}
					}
                }
				chunkLoadMap[x, y] = true;
            }
			else if(chunkMap[x, y].Count == 0 && chunkLoadMap[x, y])
            {
				for (int i = 0; i < chunkSize; i++)
				{
					for (int j = 0; j < chunkSize; j++)
					{
						int xgrid = j + (x * chunkSize);
						int ygrid = i + (y * chunkSize);

						Tree tree = treeMap[ygrid, xgrid];

						if (tree != null && tree.obj != null)
						{
							GameObject.Destroy(tree.obj);
						}
					}
				}
				chunkLoadMap[x, y] = false;
			}
        }
		public GameObject[,] SpawnBuildings(MapData map, float heightMultiplier, int levelOfDetail)
		{

			int width = map.elevationMap.GetLength(0);
			int height = map.elevationMap.GetLength(1);
			float topLeftX = (width - 1) / -2f+0.5f;
			float topLeftZ = (height - 1) / 2f-0.5f;
			if (ConfigReader.map_size % 2 == 0)
			{
				topLeftX -= 0.5f;
				topLeftZ += 0.5f;
			}
			int meshSimplificationIncrement = (levelOfDetail == 0) ? 1 : levelOfDetail * 2;

			int vertexIndex = 0;

			//Debug.Log("generating buildings");

			GameObject[,] buildingmap = new GameObject[width, height];

			for (int y = 0; y < height; y += meshSimplificationIncrement)
			{
				for (int x = 0; x < width; x += meshSimplificationIncrement)
				{

					if (map.buildingsMap[y,x]>0)
					{
						GameObject building = Instantiate(buildingPrefab, new Vector3(topLeftX + x, map.elevationMap[y, x] * heightMultiplier, topLeftZ - y), Quaternion.identity, folders[1].transform);
						buildingmap[y, x] = building;
					}
					vertexIndex++;
				}
			}
			//Debug.Log("generated trees done");
			return buildingmap;
		}
		public void SpawnCivilians(int count, Vector2 spawnLoc)
        {

			for (int i =0; i <count; i++)
            {
				float height = mapData.elevationMap[(int)spawnLoc.y, (int)spawnLoc.x]*meshHeightMultiplier;

				Civilian civilian = Instantiate(civilianPrefab, new Vector3(spawnLoc.x - (mapSize.x - 1) / 2, height, -spawnLoc.y + (mapSize.x - 1) / 2), Quaternion.identity, folders[2].transform).GetComponent<Civilian>();
				//NetworkObject netobj = civilian.GetComponent<NetworkObject>();
				//netobj.Spawn();
				civilians.Add(civilian);
				
			}


        }
		public void CutTree(Vector2 pos, bool full)
        {
			Cell currCell = cellGrid.grid[(int)pos.y][(int)pos.x];

			if (currCell.trees != null && currCell.trees.count>0)
            {
                if (!full)
                {
					currCell.trees.count -= 1;
					MapManager.tree_destroyed += 1;
					MapManager.tree_destroyed_agents += 1;
				}

				else
                {
					MapManager.tree_destroyed += currCell.trees.count;
					MapManager.tree_destroyed_agents += currCell.trees.count;
					currCell.trees.count = 0;
				}

				int texture_coordinate = ((int)pos.y * (int)mapSize.x) + (int)pos.x;
				
				
				switch (currCell.trees.count)
                {
					case (2):

                        if (currCell.trees.obj != null)
                        {
							Transform temp = currCell.trees.obj.transform;
							GameObject.Destroy(currCell.trees.obj);
							currCell.trees.generateMesh(folders[0].transform, this.treePrefab2, temp.position, Quaternion.identity);
						}
			
						mapData.colourMap[texture_coordinate] = regions[2].colour;
						break;

					case (1):

						if (currCell.trees.obj != null)
						{
							Transform temp = currCell.trees.obj.transform;
							GameObject.Destroy(currCell.trees.obj);
							currCell.trees.generateMesh(folders[0].transform, this.treePrefab1, temp.position, Quaternion.identity);
						}
						mapData.colourMap[texture_coordinate] = regions[1].colour;
						break;

					case (0):
						currCell.state = CellState.not_burnable;
						if (currCell.trees.obj != null)
						{
							GameObject.Destroy(currCell.trees.obj);
						}
						mapData.colourMap[texture_coordinate] = regions[4].colour;
						break;
				}

                if (currCell.wet>0)
                {
					currCell.hidden_color = new Color(mapData.colourMap[texture_coordinate].r, mapData.colourMap[texture_coordinate].g, mapData.colourMap[texture_coordinate].b);
					mapData.colourMap[texture_coordinate] = wet_color;
				}
				textureMap.SetPixels(mapData.colourMap);
				textureMap.Apply();
                meshRenderer.material.mainTexture = textureMap;
				UpdateAccumulativeView();
			}


            if (!Connection.IsClient)
			{
				CutTreeClientRpc(pos, full);
				ServerActionQueue.Add(new float[4] { 3, pos.x, pos.y, (full) ? (1f) : (0f) });

			}

		}

		public void setWater(Vector2 pos)
        {
			Cell currCell = cellGrid.grid[(int)pos.y][(int)pos.x];

			Debug.Log("" + pos.x + ", " + pos.y);
			currCell.state = CellState.not_burnable;
			currCell.land_type = 5;
			int texture_coordinate = ((int)pos.y * (int)mapSize.x) + (int)pos.x;

			mapData.colourMap[texture_coordinate] = regions[5].colour;

			textureMap.SetPixels(mapData.colourMap);
			textureMap.Apply();
			meshRenderer.material.mainTexture = textureMap;


		}

		public void RemoveWater(Vector2 pos)
		{
			if (pos.x < 0 || pos.x >= mapSize.x || pos.y < 0 || pos.y >= mapSize.y)
			{
				Debug.LogWarning($"RemoveWater: Invalid coordinates ({pos.x}, {pos.y})");
				return;
			}

			Cell currCell = cellGrid.grid[(int)pos.y][(int)pos.x];
			int texture_coordinate = ((int)pos.y * (int)mapSize.x) + (int)pos.x;

			if (currCell.wet > 0)
			{
				watered.Remove(currCell);
				currCell.wet = 0;
				mapData.colourMap[texture_coordinate] = currCell.hidden_color;
			}

			if (currCell.land_type == 5)
			{
				currCell.land_type = 4;
				currCell.state = CellState.not_burnable;
				mapData.colourMap[texture_coordinate] = regions[4].colour;
			}

			textureMap.SetPixels(mapData.colourMap);
			textureMap.Apply();
			meshRenderer.material.mainTexture = textureMap;

			if (!Connection.IsClient)
			{
				RemoveWaterClientRpc(pos);
				ServerActionQueue.Add(new float[3] { 5, pos.x, pos.y });
			}
		}

		[ClientRpc]
		void RemoveWaterClientRpc(Vector2 pos)
		{
			RemoveWater(pos);
		}

		[ClientRpc]
		void CutTreeClientRpc(Vector2 pos, bool full)
        {
			CutTree(pos, full);
        }

		public void SprayWater(Vector2 pos, float radius, float angle, Vector2 aim)
        {
			for (int y=((int)pos.y)-((int)radius+1); y < ((int)pos.y) + (radius + 1); y++)
            {
				for (int x = ((int)pos.x) - ((int)radius + 1); x < ((int)pos.x) + (radius + 1); x++)
				{



					// If not in map or not in radius or not in angle from aim
					if(y<0||y>=mapSize.y|| x < 0 || x >= mapSize.x || (pos - new Vector2(x, y)).magnitude > radius || Math.Abs(Vector2.SignedAngle(new Vector2(y-pos.y, x-pos.x), aim)+90) > (angle))
                    {
						continue;
                    }

					Cell currCell = cellGrid.grid[y][x];

					int texture_coordinate = (y * (int)mapSize.x) + x;

					if (currCell.state == CellState.ignited || currCell.state == CellState.on_fire || currCell.state == CellState.extenguishing)
					{
						currCell.SetState(CellState.fully_extenguished);
						MapManager.fire_extinguished += 1;
						//GameObject.Destroy(currCell.fire);
						ParticleSystem fire = currCell.fire.GetComponent<ParticleSystem>();
						fire.Stop();
						

						mapData.colourMap[texture_coordinate] = new Color(22f / 255, 26f / 255, 29f / 255);
					}
					else
					{
						if (currCell.wet > 0)
						{
							currCell.wet = drying_time;
						}
						else
						{
							watered.Add(currCell);
							currCell.wet = drying_time;
							currCell.hidden_color = new Color(mapData.colourMap[texture_coordinate].r, mapData.colourMap[texture_coordinate].g, mapData.colourMap[texture_coordinate].b);
							mapData.colourMap[texture_coordinate] = wet_color;
						}
					}
				}
			}
			textureMap.SetPixels(mapData.colourMap);
			textureMap.Apply();
			meshRenderer.material.mainTexture = textureMap;


			if (!Connection.IsClient)
			{
				SprayWaterClientRpc(pos, radius, angle, aim);
				ServerActionQueue.Add(new float[7] { 4, pos.x, pos.y, (float)radius, angle, aim.x, aim.y });

			}
			UpdateAccumulativeView();
		}

		[ClientRpc]
		void SprayWaterClientRpc(Vector2 pos, float radius, float angle, Vector2 aim)
        {
			SprayWater(pos, radius, angle, aim);
        }

		public GameObject StartFireParticle(int x, int y)
		{
			float topLeftX = (mapSize.x - 1) / -2f + 0.5f;
			float topLeftZ = (mapSize.y - 1) / 2f - 0.5f;

			return GameObject.Instantiate<GameObject>(firePrefab, new Vector3(topLeftX + x, this.mapData.elevationMap[y, x] * this.meshHeightMultiplier, topLeftZ - y), Quaternion.Euler(-90,0,0), folders[3].transform);

		}
	}
	public class MeshData
	{
		public Vector3[] vertices;
		public int[] triangles;
		public Vector2[] uvs;

		int triangleIndex;

		public MeshData(int meshWidth, int meshHeight)
		{
			vertices = new Vector3[meshWidth * meshHeight];
			uvs = new Vector2[meshWidth * meshHeight];
			triangles = new int[(meshWidth - 1) * (meshHeight - 1) * 6];
		}

		public void AddTriangle(int a, int b, int c)
		{
			triangles[triangleIndex] = a;
			triangles[triangleIndex + 1] = b;
			triangles[triangleIndex + 2] = c;
			triangleIndex += 3;
		}

		public Mesh CreateMesh()
		{
			Mesh mesh = new Mesh();
			mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;

			//Debug.Log("vertices: " + vertices.Length);
			//Debug.Log("triangles: " + triangleIndex);
			//Debug.Log("uvs: " + uvs.Length);
			mesh.vertices = vertices;
			mesh.triangles = triangles;
			mesh.uv = uvs;
			mesh.RecalculateNormals();
			return mesh;
		}
	}
	public struct TerrainType
	{
		public string name;
		public int cluster_number;
		public Color colour;
		public bool burnable;
		public int trees;

		public TerrainType(string name, int cluster_number, Color colour, bool burnable, int trees)
		{
			this.name = name;
			this.cluster_number = cluster_number;
			this.colour = colour;
			this.burnable = burnable;
			this.trees = trees;
		}
	}
	public class MapData
	{
		public float[,] elevationMap;
		public int[,] vegetationMap;
		public float[,] moistureMap;
		public float[,] windXMap;
		public float[,] windZMap;

		public Color[] rgbMap;
		public Color[] colourMap;
		public int[,] buildingsMap;
		TerrainType[] regions;
		public bool toggleColor;
		public MapData(float[,] elevationMap, int[,] vegetationMap, float[,] moistureMap,
					   float[,] windXMap, float[,] windZMap, Color[] rgbMap, int[,] buildingsMap, TerrainType[] regions)
		{
			this.elevationMap = elevationMap;
			this.vegetationMap = vegetationMap;
			this.moistureMap = moistureMap;
			this.windXMap = windXMap;
			this.windZMap = windZMap;
			this.rgbMap = rgbMap;
			this.colourMap = rgbMap;
			this.regions = regions;
			this.buildingsMap = buildingsMap;

			toggleColor = true;
		}
		public void SwitchColor()
		{
			if (toggleColor)
			{
				this.colourMap = new Color[elevationMap.GetLength(0) * elevationMap.GetLength(1)];
				for (int i = 0, x = 0; x < elevationMap.GetLength(0); x++)
				{
					for (int y = 0; y < elevationMap.GetLength(1); y++)
					{
						colourMap[i] = Color.white;
						foreach (var r in this.regions)
						{
							if (vegetationMap[x, y] == r.cluster_number)
								colourMap[i] = r.colour;
						}

						i++;
					}
				}
				toggleColor = false;
			}
		}
	}
	public class Tree
	{
		public GameObject obj;
		public int count;

		public Tree(int count)
		{
			this.count = count;

		}
		public void generateMesh(Transform t, GameObject prefab, Vector3 pos, Quaternion rot)
		{
			this.obj = UnityEngine.GameObject.Instantiate(prefab, pos, rot, t);
		}
	}
	public enum CellState { burnable, not_burnable, ignited, on_fire, extenguishing, fully_extenguished };
	public class Cell
	{
		public int x;
		public int y;
		public MapManager map;
		public readonly float elevation;
		public int land_type;
		public float moisture;
		public float wind_x;
		public float wind_z;
		int burning_time;
		public Tree trees;
		public GameObject building;
		public GameObject fire;
		public int wet;
		public Color hidden_color;
		


		public CellState state;
		CellState prev_state;

		public Cell(int x, int y, MapManager map, int land_type, float elevation, float moisture, float wind_x, float wind_z, Tree tree, GameObject building)
		{
			this.x = x;
			this.y = y;
			this.map = map;
			this.land_type = land_type;
			this.elevation = elevation;
			this.moisture = moisture;
			this.wind_x = wind_x;
			this.wind_z = wind_z;
			this.trees = tree;
			this.building = building;
			this.wet = 0;
			this.burning_time = 0;

			switch (land_type)
			{
				case 0:
					this.state = CellState.burnable;
					break;

				case 1:
					this.state = CellState.burnable;
					break;

				case 2:
					this.state = CellState.burnable;
					break;

				case 3:
					this.state = CellState.not_burnable;
					break;
				case 4:
					this.state = CellState.not_burnable;
					break;
				case 5:
					this.state = CellState.not_burnable;
					break;
			}

			this.prev_state = this.state;
        }

        public void SetState(CellState new_state)
        {
            this.prev_state = this.state;
            this.state = new_state;
        }

		public void DestroyStuff()
        {
            if (this.trees!=null)
            {
				MapManager.tree_destroyed += this.trees.count;
				MapManager.tree_destroyed_fire += this.trees.count;
				this.trees.count = 0;
				GameObject.Destroy(this.trees.obj);
			}
			if (this.building != null)
            {
				MapManager.buildings_destroyed += 1;
				GameObject.Destroy(this.building);
			}

        }

		public void UpdateCell()
		{
			if (this.state == CellState.not_burnable)
				return;

			if (this.state == CellState.ignited && this.prev_state == CellState.ignited)
			{
				this.SetState(CellState.on_fire);
				this.DestroyStuff();
				return;
			}

			else if (this.state == CellState.on_fire && this.prev_state == CellState.on_fire)
			{
				this.SetState(CellState.extenguishing);
				return;
			}

			else if (this.state == CellState.extenguishing && this.prev_state == CellState.extenguishing)
			{
				this.burning_time++;
				if (this.burning_time >= 10)
				{
					this.SetState(CellState.fully_extenguished);
					ParticleSystem fire = this.fire.GetComponent<ParticleSystem>();
					fire.Stop();
				}
				return;
			}

			this.prev_state = this.state;
		}

	}
	public class CellGrid
	{
		public List<List<Cell>> grid;
		public List<List<Cell>> new_grid;
		public MapManager map;
		public bool hasIgnitedCell;

		public CellGrid(MapManager map, int[,] vegetation_data, float[,] elevation_data, float[,] moisture_data,
						float[,] wind_x_data, float[,] wind_z_data, Tree[,] tree_data, int[,] buildings_data, GameObject[,] buildings)
		{
			this.map = map;
			this.grid = new List<List<Cell>>();

			int[,] vulnerabilityMap = ExpandClusters(buildings_data,MapManager.vulnerability_range);
			//Debug.Log(vulnerabilityMap);

			for (int x = 0; x < vegetation_data.GetLength(0); x++)
			{
				List<Cell> row = new List<Cell>();
				for (int y = 0; y < vegetation_data.GetLength(1); y++)
				{

					Cell cell = new Cell(x, y, map, vegetation_data[x, y], elevation_data[x, y], moisture_data[x, y],
									 wind_x_data[x, y], wind_z_data[x, y], tree_data[x,y], buildings[x,y]);

                    if (vulnerabilityMap[x, y] == 1)
                    {
						cell.state = CellState.burnable;
                    }

					row.Add(cell);
				}

				this.grid.Add(row);
			}

			this.new_grid = new List<List<Cell>>(this.grid);

			this.hasIgnitedCell = false;
		}

		public List<Cell> Neighbours(int x, int y)
		{
			List<Cell> neighbours = new List<Cell> {
			this.new_grid[x-1][y-1],
			this.new_grid[x-1][y],
			this.new_grid[x-1][y+1],
			this.new_grid[x][y+1],
			this.new_grid[x+1][y+1],
			this.new_grid[x+1][y],
			this.new_grid[x+1][y-1],
			this.new_grid[x][y-1],
		};

			return neighbours;
		}

		public float[,] Direction()
		{
			float[,] direction = new float[,] {
			{1/Mathf.Sqrt(2), -1/Mathf.Sqrt(2)},
			{0, 1},
			{1/Mathf.Sqrt(2), 1/Mathf.Sqrt(2)},
			{1, 0},
			{1/Mathf.Sqrt(2), -1/Mathf.Sqrt(2)},
			{-1, 0},
			{-1/Mathf.Sqrt(2), -1/Mathf.Sqrt(2)},
			{0, -1},
		};

			return direction;
		}

		public bool SetFire(int x, int y)
		{

			if ((x != 0 && x != this.grid.Count) && (y != 0 && y != this.grid[0].Count)
				&& this.grid[x][y].state != CellState.not_burnable)
			{
				this.grid[x][y].SetState(CellState.ignited);
				this.hasIgnitedCell = true;
				return true;
			}
            else
            {
				
				Debug.Log("Ignition Failed");
				return false;
            }
		}

		public float Slope(Cell source, Cell cell)
		{
			float slope = Mathf.Atan((cell.elevation - source.elevation) * 890f / 30f) * 180f / Mathf.PI;
			return slope;
		}

		public float SlopeFactor(float slope)
		{
			if (slope < 0f)
				return Mathf.Exp(-0.069f * slope) / (2f * Mathf.Exp(-0.069f * slope) - 1f);

			else
				return Mathf.Exp(0.069f * slope);
		}

		public float Ratio(Cell source, Cell cell, float[] dir)
		{
			if (cell.state == CellState.not_burnable)
				return 0f;

			float windMagnitude = Mathf.Sqrt(Mathf.Pow(source.wind_x, 2) + Mathf.Pow(source.wind_z, 2));
			if (windMagnitude == 0f)
				windMagnitude = 0.0001f; // Prevent division by zero

			return MapManager.R_0 * this.SlopeFactor(this.Slope(source, cell)) * (float)(1 - ((cell.moisture + ((cell.wet > 0) ? 20 : 0)) / MapManager.moisture_constant))
				   * (Vector2.Dot(new Vector2(source.wind_x / windMagnitude,
											 source.wind_z / windMagnitude),
								 new Vector2(dir[0], dir[1]))
				   + 1f) / 2f;
		}

		public void Update()
		{
			for (int x = 0; x < this.grid.Count; x++)
			{
				for (int y = 0; y < this.grid[0].Count; y++)
				{
					this.grid[x][y].SetState(this.new_grid[x][y].state);
				}
			}
		}
		public void Simulate()
		{
			bool chunkIsIgnited = false;

			for (int x = 1; x < this.grid.Count - 1; x++)
			{
				for (int y = 1; y < this.grid[0].Count - 1; y++)
				{
					this.new_grid[x][y].UpdateCell();

					if (this.grid[x][y].state == CellState.ignited)
						chunkIsIgnited = true;

					if (this.grid[x][y].state == CellState.on_fire)
					{
						chunkIsIgnited = true;

						List<Tuple<Cell, float[]>> tuples = CellGrid.ToTuples(Neighbours(x, y), Direction());

						List<Tuple<Cell, float[]>> filtered_tuples = new List<Tuple<Cell, float[]>>();
						foreach (var t in tuples)
						{
							if (t.Item1.state == CellState.burnable)
								filtered_tuples.Add(t);
						}

						foreach (var t in filtered_tuples)
						{

							if (this.Ratio(this.grid[x][y], t.Item1, t.Item2) > MapManager.thresh_up)
							{
								t.Item1.fire = map.StartFireParticle(t.Item1.y, t.Item1.x);
								t.Item1.SetState(CellState.on_fire);
								t.Item1.DestroyStuff();
							}

							else if (this.Ratio(this.grid[x][y], t.Item1, t.Item2) > MapManager.thresh_down)
							{
								t.Item1.fire = map.StartFireParticle(t.Item1.y, t.Item1.x);
								t.Item1.SetState(CellState.ignited);
							}
						}
					}
				}
			}

			this.hasIgnitedCell = chunkIsIgnited;

			this.Update();
		}
		public static List<Tuple<Cell, float[]>> ToTuples(List<Cell> cells, float[,] dirs)
		{
			List<Tuple<Cell, float[]>> tuples = new List<Tuple<Cell, float[]>>();

			for (int i = 0; i < cells.Count; i++)
			{
				Tuple<Cell, float[]> t = Tuple.Create(cells[i], new float[] { dirs[i, 0], dirs[i, 1] });
				tuples.Add(t);
			}

			return tuples;
		}
		public static int[,] ExpandClusters(int[,] classes, int numIterations)
		{
			int w = classes.GetLength(0);
			int h = classes.GetLength(1);

			for (int _ = 0; _ < numIterations; _++)
			{
				int[,] newClasses = (int[,])classes.Clone();

				for (int i = 1; i < w - 1; i++)
				{
					for (int j = 1; j < h - 1; j++)
					{
						if (classes[i, j] == 1)
						{
							for (int di = -1; di <= 1; di++)
							{
								for (int dj = -1; dj <= 1; dj++)
								{
									if (!(di == 0 && dj == 0) && classes[i + di, j + dj] != 1)
									{
										newClasses[i + di, j + dj] = 1;
									}
								}
							}
						}
					}
				}

				classes = newClasses;
			}

			return classes;
		}
	}

}
