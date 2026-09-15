using System.Collections;
using System.Collections.Generic;
using UnityEngine;


namespace Examples.Wildfire {
    public class Civilian : MonoBehaviour {

        public MapManager mapManager;
        private int range;
        public bool active;
        public bool alive;
        public Vector2 gridPos;
        private Vector2[] directions = {new Vector2(1,0), new Vector2(-1, 0) , new Vector2(0, 1) , new Vector2(0, -1)};
        public GameObject carrier;
        public MeshRenderer mesh;
        public GameObject CivilainSpritePrefab;
        public GameObject CivilainSprite;
        public bool seen;


        public void Start()
        {
            mapManager = FindObjectOfType<MapManager>();
            active = true;
            alive = true;
            range = mapManager.cellGrid.grid.Count;
            gridPos = new Vector2(this.transform.position.x + (range - 1) / 2, -this.transform.position.z + (range - 1) / 2);
            CivilainSprite = Instantiate(CivilainSpritePrefab);
            seen = false;

        }
        void FixedUpdate()
        {

            CivilainSprite.transform.position = new Vector3((this.transform.position.x-1) / MapManager.mapSize.x, ((this.transform.position.z+1) / MapManager.mapSize.y)-100, -0.1f);

            if(carrier != null && !active)
            {
                mesh.enabled = false;
                this.transform.position = carrier.transform.position;
                CivilainSprite.SetActive(false);
            }
            else
            {
                mesh.enabled = true;
                if (seen)
                {
                    CivilainSprite.SetActive(true);
                }
                else
                {
                    CivilainSprite.SetActive(false);
                }
                      
                
            }
            if (alive)
            {
                CellState current_grid_state = mapManager.cellGrid.grid[(int)gridPos.y][(int)gridPos.x].state;
                if (!(current_grid_state == CellState.burnable || current_grid_state == CellState.not_burnable) && alive)
                {
                    active = false;
                    alive = false;
                    MapManager.civilians_destroyed += 1;
                    gameObject.SetActive(false);
                    CivilainSprite.SetActive(false);
                }

            }
            if (mapManager.frames % ConfigReader.civilian_move_speed == 0)
            {
                if (active)
                {
                    List<Vector2> posDirection = new List<Vector2>();
                    foreach (Vector2 dir in directions)
                    {
                        Vector2 newGridPos = this.gridPos + dir;
                        if (newGridPos.x >= 0 && newGridPos.x < range - 1 && newGridPos.y >= 0 && newGridPos.y < range - 1)
                        {
                            CellState current_grid_state = mapManager.cellGrid.grid[(int)newGridPos.y][(int)newGridPos.x].state;
                            if ((current_grid_state == CellState.burnable || current_grid_state == CellState.not_burnable))
                            {
                                posDirection.Add(newGridPos);
                            }
                        }
                    }
                    if (posDirection.Count > 0)
                    {
                        Vector2 chosenDir = posDirection[(int)(Random.value * posDirection.Count)];
                        gridPos = chosenDir;
                        this.transform.position = new Vector3(chosenDir.x - (range - 1) / 2, mapManager.mapData.elevationMap[(int)chosenDir.y, (int)chosenDir.x] * mapManager.meshHeightMultiplier + 0.25f, -chosenDir.y + (range - 1) / 2);

                    }
                }
            }

        }
        

        
    }


}

