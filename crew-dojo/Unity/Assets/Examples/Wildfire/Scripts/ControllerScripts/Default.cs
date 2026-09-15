using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using Unity.Netcode;

namespace Examples.Wildfire
{
    public class Default : PlayerController
    {



        private void Start()
        {



            
        }

        void FixedUpdate()
        {
            gridPos = new Vector2(this.transform.position.x + (range - 1) / 2, -this.transform.position.z + (range - 1) / 2);



            

        }
        public override void HandleActionArray(float[] actionArray)
        {
            

        }


        [ClientRpc]
        public void RemoveAgentClientRpc()
        {
            AIAgent agent = GetComponent<AIAgent>();
            agent.IsPlayerAlive = false;
           
        }

    }

}
