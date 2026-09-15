using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using Unity.Netcode;

namespace Examples.Wildfire
{
    public class Bulldozer : PlayerController
    {
        public bool alive;
        public bool cutting;
        public Vector2 target_position;
        public Vector2 target_vector;
        public float speed;
        private bool moving;



        private void Start()
        {
            chunk_radius = 3;
            target_position = this.transform.position;
            cutting = false;
            speed = 4f/50f;
            alive = true;
            map.bulldozers.Add(this);
            controllerType = ControllerType.Bulldozer;

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
                

                CellState currCellState = map.cellGrid.grid[(int)gridPos.y][(int)gridPos.x].state;
                if (currCellState != CellState.burnable && currCellState != CellState.not_burnable && alive)
                {

                    if (!Connection.IsClient)
                    {
                        //AIAgent agent = GetComponent<AIAgent>();
                        //agent.IsPlayerAlive = false;
                    }
                    alive = false;
                    map.bulldozers.Remove(this);
                    MapManager.bulldozers_destroyed += 1;
                    agent.controllerType = ControllerType.Default;
                    this.controllerType = ControllerType.Default;
                    this.mapSprite.SetActive(false);
                    MeshRenderer mesh = GetComponent<MeshRenderer>();
                    mesh.enabled = false;
                }



                if(moving & alive)
                {
                    //Calculates new position in x,z, then uses raycast to find height
                    RaycastHit hit;


                    float adjusted_speed = 0;
                    if (cutting)
                    {
                        adjusted_speed = speed / 2;
                        CutTree();
                    }
                    else
                    {
                        adjusted_speed = speed;
                    }

                    Vector2 new_pos = new Vector2(this.transform.position.x, this.transform.position.z) + adjusted_speed * target_vector;
                    Physics.Raycast(new Vector3(new_pos.x, 0, new_pos.y) + new Vector3(0f, 1000f, 0f), new Vector3(0, -1, 0), out hit);
                    float height = 1000.1f - hit.distance;

                    this.transform.position = new Vector3(new_pos.x, height, new_pos.y);
                    Vector2 totarget = Vector3.Normalize(target_position - new Vector2(this.transform.position.x, this.transform.position.z));
                    if (Vector3.Dot(target_vector, totarget) < 0)
                    {
                        moving = false;
                    }

                    var lookRotation = Quaternion.FromToRotation(this.transform.forward, new Vector3(target_vector.x, 0, target_vector.y));
                    var targetrot = this.transform.rotation * lookRotation;


                    this.transform.rotation = Quaternion.Slerp(this.transform.rotation, targetrot, 0.15f);
                    transform.eulerAngles = new Vector3(0, transform.eulerAngles.y, 0);
                }




            }
            
        }
        public override void HandleActionArray(float[] actionArray)
        {
            target_position = new Vector2(actionArray[1] - (range - 1) / 2 + 0.5f, -(actionArray[2]) + (range - 1) / 2 - 0.5f);
            target_vector = target_position - new Vector2(this.transform.position.x, this.transform.position.z);

            target_vector = Vector2.ClampMagnitude(target_vector, 1);

            switch (actionArray[0])
            {
         
                case (0f):
                    cutting = false;
                    moving = true;
                    mesh_renderer.material = main_material;
                    setMainMaterialClientRpc();
                    break;
                    

                case (1f):
                    cutting = true;
                    moving = true;
                    mesh_renderer.material = alt_material;
                    setAltMaterialClientRpc();
                    break;
                default:
                    Debug.Log("invalid discrete action");
                    moving = false;
                    break;
            }
        }

        public void CutTree()
        {
            int range = this.range;
            Vector2 gridPos = new Vector2(this.transform.position.x + (range - 1) / 2, -this.transform.position.z + (range - 1) / 2);
            this.map.CutTree(gridPos, true);
            //Debug.Log("cut tree");
        }
        [ClientRpc]
        public void RemoveAgentClientRpc()
        {
            AIAgent agent = GetComponent<AIAgent>();
            agent.IsPlayerAlive = false;
            map.bulldozers.Remove(this);
        }
    }
}
