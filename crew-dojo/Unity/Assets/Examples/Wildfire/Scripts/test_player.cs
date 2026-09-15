using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class test_player : MonoBehaviour
{
    // Start is called before the first frame update



    // Update is called once per frame
    void FixedUpdate()
    {
        if (Input.GetKey(KeyCode.W))
        {
            transform.position += transform.forward*0.3f;
        }
        if (Input.GetKey(KeyCode.S))
        {
            transform.position -= transform.forward*0.3f;
        }
        if (Input.GetKey(KeyCode.A))
        {
            transform.eulerAngles += new Vector3(0, -2, 0);
        }
        if (Input.GetKey(KeyCode.D))
        {
            transform.eulerAngles += new Vector3(0, 2, 0);
        }
        if (Input.GetKey(KeyCode.Space))
        {
            transform.position+= new Vector3(0, 0.1f, 0);
        }
        if (Input.GetKey(KeyCode.LeftControl))
        {
            transform.position += new Vector3(0, -0.1f, 0);
        }

    }
}
