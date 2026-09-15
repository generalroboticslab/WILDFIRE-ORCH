using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using Dojo;
using Nakama.TinyJson;



namespace Examples.Wildfire
{
    public class InterfaceManager : MonoBehaviour
    {

        public Camera minimapCam;
        public bool following;
        private Canvas mainCanvas;
        public RawImage minimap;
        public RawImage povview;
        private DojoConnection _connection;
        public PlayerController playerfollow;

        public void Awake()
        {
            mainCanvas = GetComponent<Canvas>();
            _connection = FindObjectOfType<DojoConnection>();
            minimap.enabled = false;
            povview.enabled = false;
        }


        public void ToggleAgent(int id)
        {
            var eventData = new List<object>() { id };
            _connection.SendStateMessage((long)NetOpCode.ImitationLearning, JsonWriter.ToJson(eventData));
            following = !following;

            PlayerController[] firstList = GameObject.FindObjectsOfType<PlayerController>();
            foreach (PlayerController p in firstList)
            {
                if (p.playerid == id)
                {
                    playerfollow = p;
                    playerfollow.TogglePOV();
                    float maprange = MapManager.miniMapRanges[(int)playerfollow.controllerType];
                    minimapCam.orthographicSize = maprange / MapManager.mapSize.x;
                }

            }
            if (following)
            {
                minimap.enabled = true;
                povview.enabled = true;
            }
            else
            {
                minimap.enabled = false;
                povview.enabled = false;
            }
        }

        public void Update()
        {
            if(following)
            {
                minimapCam.transform.position = new Vector3((playerfollow.transform.position.x - 0.5f) / MapManager.mapSize.x, (playerfollow.transform.position.z + 0.5f) / MapManager.mapSize.y, -1);

                
                Vector2 currentResolution = new Vector2(Screen.width, Screen.height);

                if (Input.GetMouseButtonDown(1) || Input.GetKeyDown(KeyCode.Space))
                {

                    float mouse_x = ((2 * Input.mousePosition.x) / currentResolution.x) - 0.5f;
                    float mouse_y = ((Input.mousePosition.y) / currentResolution.y) - 0.5f;



                    if (mouse_x > -0.5 && mouse_x < 0.5 && mouse_y > -0.5 && mouse_y < 0.5)
                    {


                        float maprange = MapManager.miniMapRanges[(int)playerfollow.agent.controllerType];
                        float x_pos = playerfollow.transform.position.x + (mouse_x * maprange*2);
                        float y_pos = playerfollow.transform.position.z + (mouse_y * maprange*2);

                        Debug.Log((x_pos, y_pos));

                        var eventData = new List<float>() { (float)playerfollow.playerid, 0f, x_pos, y_pos };
                        _connection.SendStateMessage((long)NetOpCode.ClientAction, eventData.ToJson());
                    }

                }
            }
           





        }



    }
}

