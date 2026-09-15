using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using Unity;
using Unity.Netcode;

namespace Examples.Wildfire
{
    public class Firefighter : PlayerController
    {
        public bool moving;
        public bool carrying;
        public bool alive;
        public bool cutting;
        public bool active;
        public bool picking;

        public Vector2 target_position;
        public Vector2 target_vector;
        public float speed;
        public Civilian carry;
        private int delay;
        private int water;
        
        
        
        private void Start()
        {
            active = true;
            water = 0;
            chunk_radius = 3;
            target_position = this.transform.position;
            moving = false;
            cutting = false;
            speed = 6f/50f;
            alive = true;
            picking = false;
            map.firefighters.Add(this);
            controllerType = ControllerType.Firefighter;

        }

        void FixedUpdate()
        {

            gridPos = new Vector2(this.transform.position.x + (range - 1) / 2, -this.transform.position.z + (range - 1) / 2);

            if(carrying)
            {
                carry.gridPos = gridPos;
            }



            int newXchunk = (int)(gridPos.x / (float)MapManager.chunkSize);
            int newYchunk = (int)(gridPos.y / (float)MapManager.chunkSize);

            if((!IsClient || controlled) && (newXchunk!=prevXchunk || newYchunk != prevYchunk))
            {
                //Debug.Log("move chunks");
                prevXchunk = newXchunk;
                prevYchunk = newYchunk;
                updateChunks(chunk_radius);
            }


            if (!Connection.IsClient)
            {
                CellState currCellState = map.cellGrid.grid[(int)gridPos.y][(int)gridPos.x].state;
                if (currCellState != CellState.burnable && currCellState != CellState.not_burnable && currCellState != CellState.fully_extenguished && active && alive)
                {
                    alive = false;

                    //if (!Connection.IsClient)
                    //{
                    //    agent.IsPlayerAlive = false;
                    //}
                    map.firefighters.Remove(this);
                    MapManager.firefighters_destroyed += 1;
                    agent.controllerType = ControllerType.Default;
                    this.controllerType = ControllerType.Default;
                    this.mapSprite.SetActive(false);
                    MeshRenderer mesh = GetComponent<MeshRenderer>();
                    mesh.enabled = false;
                    
                    
                }

                // If moving
                if (moving && alive)
                {
                    //Calculates new position in x,z, then uses raycast to find height
                    RaycastHit hit;


                    Cell currentCell = map.cellGrid.grid[(int)gridPos.y][(int)gridPos.x];
                    float adjusted_speed = 0;
                    if(currentCell.trees!= null)
                    {
                        adjusted_speed = speed*(5 - currentCell.trees.count)/5;
                    }
                    else
                    {
                        adjusted_speed = speed;
                    }

                    Vector2 new_pos = new Vector2(this.transform.position.x, this.transform.position.z) + adjusted_speed * target_vector;
                     
                    Physics.Raycast(new Vector3(new_pos.x, 0, new_pos.y) + new Vector3(0f, 1000f, 0f), new Vector3(0, -1, 0), out hit);

                    float height = 1000.2f - hit.distance;


                    this.transform.position = new Vector3(new_pos.x, height, new_pos.y);



                    var lookRotation = Quaternion.FromToRotation(this.transform.forward, new Vector3(target_vector.x, 0, target_vector.y));
                    var targetrot = this.transform.rotation * lookRotation;
                    this.transform.rotation = Quaternion.Slerp(this.transform.rotation, targetrot, 0.2f);
                    transform.eulerAngles = new Vector3(0, transform.eulerAngles.y, 0);



                    // Makes sure it hasn't passed the target location
                    //Vector2 test_vector = target_position - new Vector2(this.transform.position.x, this.transform.position.z);
                    //test_vector = Vector2.ClampMagnitude(test_vector, 1);
                    Vector2 totarget = Vector3.Normalize(target_position - new Vector2(this.transform.position.x, this.transform.position.z));
                    if (Vector3.Dot(target_vector, totarget) < 0)
                    {
                        moving = false;
                    }


                }
                // If cutting
                else if(alive && cutting){

                    Vector2 gridCenter = new Vector2(((int)gridPos.x)-(range-1)/2 + 0.5f, -((int)gridPos.y)+(range-1)/2-0.5f);
                    Vector2 treeVector = new Vector2(gridCenter.x-this.transform.position.x, gridCenter.y- this.transform.position.z);

                    var lookRotation = Quaternion.FromToRotation(this.transform.forward, new Vector3(treeVector.x, 0, treeVector.y));
                    var targetrot = this.transform.rotation * lookRotation;
                    this.transform.rotation = Quaternion.Slerp(this.transform.rotation, targetrot, 0.15f);
                    transform.eulerAngles = new Vector3(0, transform.eulerAngles.y, 0);

                    if(delay==0){
                        CutTree();
                        delay = -1;
                        mesh_renderer.material = main_material;
                        setMainMaterialClientRpc();
                    }
                    else if(delay>0){
                        delay-=1;

                    }

                }
                // If spraying
                else if(alive && !cutting && !picking)
                {


                    var lookRotation = Quaternion.FromToRotation(this.transform.forward, new Vector3(target_vector.x, 0, target_vector.y));
                    var targetrot = this.transform.rotation * lookRotation;
                    this.transform.rotation = Quaternion.Slerp(this.transform.rotation, targetrot, 0.2f);
                    transform.eulerAngles = new Vector3(0, transform.eulerAngles.y, 0);

                    if (delay == 0)
                    {
                        if (water > 0)
                        {
                            this.map.SprayWater(new Vector2((int)gridPos.x, (int)gridPos.y), 3, 60f, target_vector);
                           
                            water -= 1;
                        }
                        delay = -1;
                        mesh_renderer.material = main_material;
                        setMainMaterialClientRpc();
                    }
                    else if (delay > 0)
                    {
                        delay -= 1;

                    }
                }

            }


            this.extraVariables[0] = (this.carrying)? 1:0;
            this.extraVariables[1] = this.water;
            this.extraVariables[2] = (this.active) ? 0 : 1;


        }
        public override void HandleActionArray(float[] actionArray)
        {
            target_position = new Vector2(actionArray[1] - (range - 1) / 2 + 0.5f, -(actionArray[2]) + (range - 1) / 2 - 0.5f);

            target_vector = target_position - new Vector2(this.transform.position.x, this.transform.position.z);

            target_vector = Vector2.ClampMagnitude(target_vector, 1);


            if (!active)
            {
                moving = false;
                cutting = false;
                return;
                
            }
            switch (actionArray[0])
            {
                //move
                case (0f):
                    moving = true;
                    cutting = false;
                    picking = false;
                    mesh_renderer.material = main_material;
                    setMainMaterialClientRpc();
                    break;

                //cut nearest tree
                case (1f):
                    moving = false;
                    cutting = true;
                    picking = false;
                    mesh_renderer.material = alt_material;
                    setAltMaterialClientRpc();
                    delay = 50;
                    break;

                //pick up civilian in grid
                case (2f):
                    CarryCivilian();
                    moving = false;
                    cutting = false;
                    picking = true;
                    mesh_renderer.material = main_material;
                    setMainMaterialClientRpc();
                    break;

                //spray water
                case (3f):
                    mesh_renderer.material = alt_material;
                    moving = false;
                    cutting = false;
                    picking = false;
                    setAltMaterialClientRpc();
                    delay = 50;
                    break;
                //refill water
                case (4f):
                    RefillWater();
                    mesh_renderer.material = main_material;
                    moving = false;
                    cutting = false;
                    picking = true;
                    setMainMaterialClientRpc();
                    break;
                default:
                    Debug.Log("invalid discrete action");
                    moving = false;
                    cutting = false;
                    break;
            }

        }

        public void CarryCivilian()
        {
            int range = map.cellGrid.grid.Count;

            if (!carrying)
            {
                foreach (Civilian c in map.civilians)
                {
                    int pick_up_range = 4;
                    if ((new Vector2((int)gridPos.x - (int)c.gridPos.x, (int)gridPos.y - (int)c.gridPos.y).magnitude < pick_up_range) && c.active)
                    {
                        Debug.Log("pick up");
                        c.active = false;
                        c.carrier = this.gameObject;
                        carry = c;
                        carrying = true;
                        break;
                    }
                }
            }
            else
            {
                Debug.Log("put down");
                carrying = false;
                carry.carrier = null;
                carry.active = true;
                carry.gridPos = gridPos;
                carry = null;
            }   
        }
        public void RefillWater()
        {
            int refillRange = 3;
            for (int dy = -refillRange; dy <= refillRange && water == 0; dy++)
            {
                for (int dx = -refillRange; dx <= refillRange && water == 0; dx++)
                {
                    int cx = (int)gridPos.x + dx, cy = (int)gridPos.y + dy;
                    if (cx >= 0 && cx < MapManager.mapSize.x && cy >= 0 && cy < MapManager.mapSize.y)
                    {
                        if (map.cellGrid.grid[cy][cx].land_type == 5)
                        {
                            water = 5;
                        }
                    }
                }
            }
        }
        public void CutTree()
        {

            this.map.CutTree(gridPos, false);
            //Debug.Log("cut tree");
        }

        [ClientRpc]
        public void RemoveAgentClientRpc()
        {
            AIAgent agent = GetComponent<AIAgent>();
            agent.IsPlayerAlive = false;
            map.firefighters.Remove(this);
        }
    }
}
