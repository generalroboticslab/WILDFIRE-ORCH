using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using Unity.Netcode;

namespace Examples.Wildfire
{
    public class Helicopter: PlayerController
    {

        public Vector2 target_position;
        public Vector2 target_vector;
        public float speed;
        public bool moving;
        private int max_capacity;
        public int water;
        public int pick_up_range;
        public List<Firefighter> firefightercarry;


        private void Start()
        {
            pick_up_range = 3;
            max_capacity = 5;
            chunk_radius = 6;
            target_position = this.transform.position;
            speed = 15f / 50f;
            water = 0;
            map.helicopters.Add(this);
            controllerType = ControllerType.Helicopter;
            firefightercarry = new List<Firefighter>();
        }

        void FixedUpdate()
        {
            gridPos = new Vector2(this.transform.position.x + (range - 1) / 2, -this.transform.position.z + (range - 1) / 2);




            int newXchunk = (int)(gridPos.x / MapManager.chunkSize);
            int newYchunk = (int)(gridPos.y / MapManager.chunkSize);

            if ((!IsClient || controlled) && (newXchunk != prevXchunk || newYchunk != prevYchunk))
            {
                prevXchunk = newXchunk;
                prevYchunk = newYchunk;
                updateChunks(chunk_radius);
            }
            if (!Connection.IsClient)
            {

                // if moving
                if (moving)
                {
                    //Calculates new position in x,z, then uses raycast to find height
                    RaycastHit hit;

                    Vector2 new_pos = new Vector2(this.transform.position.x, this.transform.position.z) + speed * target_vector;
                    Physics.Raycast(new Vector3(new_pos.x, 0, new_pos.y) + new Vector3(0f, 1000f, 0f), new Vector3(0, -1, 0), out hit);
                    float height = 1017f - hit.distance;

                    this.transform.position = new Vector3(new_pos.x, height, new_pos.y);
                    Vector2 totarget = Vector3.Normalize(target_position - new Vector2(this.transform.position.x, this.transform.position.z));
                    if (Vector3.Dot(target_vector, totarget) < 0)
                    {
                        moving = false;
                    }

                    var lookRotation = Quaternion.FromToRotation(this.transform.forward, new Vector3(target_vector.x, 0, target_vector.y));
                    var targetrot = this.transform.rotation * lookRotation;


                    this.transform.rotation = Quaternion.Slerp(this.transform.rotation, targetrot, 0.1f);
                    transform.eulerAngles = new Vector3(0, transform.eulerAngles.y, 0);
                }

                foreach(Firefighter f in firefightercarry)
                {
                    f.transform.position = this.transform.position - new Vector3(0, 0.5f, 0);
                }
                
            }

            this.extraVariables[0] = this.firefightercarry.Count;
            this.extraVariables[1] = this.water;
            this.extraVariables[2] = 0;

        }
        public override void HandleActionArray(float[] actionArray)
        {
            target_position = new Vector2(actionArray[1] - (range - 1) / 2 + 0.5f, -(actionArray[2]) + (range - 1) / 2 - 0.5f);
            target_vector = target_position - new Vector2(this.transform.position.x, this.transform.position.z);

            target_vector = Vector2.ClampMagnitude(target_vector, 1);


            switch (actionArray[0])
            {
                //move
                case (0f):
                    moving = true;
                    mesh_renderer.material = main_material;
                    setMainMaterialClientRpc();
                    break;

                //pick up humans
                case (1f):
                    moving = false;
                    mesh_renderer.material = alt_material;
                    setAltMaterialClientRpc();
                    PickUpFirefighters();
                    break;

                //refill water
                case (2f):
                    moving = false;
                    mesh_renderer.material = alt_material;
                    setAltMaterialClientRpc();
                    RefillWater();
                    break;

                //drop humans or water
                case (3f):
                    moving = false;
                    mesh_renderer.material = alt_material;
                    setAltMaterialClientRpc();
                    DropOff();
                    break;


                default:
                    Debug.Log("invalid discrete action");
                    moving = false;
                    break;
            }

        }

        private void PickUpFirefighters()
        {
            foreach (Firefighter f in map.firefighters)
            {
                if (new Vector2((int)gridPos.x - (int)f.gridPos.x, (int)gridPos.y - (int)f.gridPos.y).magnitude < pick_up_range)
                {
                    if (firefightercarry.Count < max_capacity && water == 0)
                    {
                        Debug.Log("pick up firefighter");

                        if (f.active)
                        {
                            f.active = false;
                            firefightercarry.Add(f);
                        }
                    }




                }
            }
            
        }
        private void RefillWater()
        {
            if (firefightercarry.Count == 0 && water < max_capacity)
            {
                int refillRange = 3;
                for (int dy = -refillRange; dy <= refillRange && water < max_capacity; dy++)
                {
                    for (int dx = -refillRange; dx <= refillRange && water < max_capacity; dx++)
                    {
                        int cx = (int)gridPos.x + dx, cy = (int)gridPos.y + dy;
                        if (cx >= 0 && cx < MapManager.mapSize.x && cy >= 0 && cy < MapManager.mapSize.y)
                        {
                            if (map.cellGrid.grid[cy][cx].land_type == 5)
                            {
                                water = max_capacity;
                            }
                        }
                    }
                }
            }
        }
        private void DropOff()
        {
            if (firefightercarry.Count > 0)
            {
                
                foreach(Firefighter f in firefightercarry)
                {
                    f.active = true;
                }
                firefightercarry.Clear();

            }
            if(water > 0)
            {
                this.map.SprayWater(new Vector2((int)gridPos.x, (int)gridPos.y), 4.5f, 360f, new Vector2(1,1));
                water -= 1;
            }
        }
        [ClientRpc]
        public void RemoveAgentClientRpc()
        {
            AIAgent agent = GetComponent<AIAgent>();
            agent.IsPlayerAlive = false;
            map.helicopters.Remove(this);
        }
    }

}
