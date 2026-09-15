using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using System;
using Nakama.TinyJson;
using Dojo;
using Dojo.UI;
using Dojo.UI.Feedback;
using System.Linq;

namespace Examples.Wildfire
{
    public class HumanInterface : FeedbackInterface
    {
        private const string LOGSCOPE = "HumanInterface";

        [SerializeField]
        private DojoMenu _menu;

        [SerializeField]
        private InputActionAsset _feedbackActions;

        private DojoConnection _connection;
        private InputActionMap _feedbackControl;
        private bool _isControllingAgent = false;
        private InterfaceManager _interface;
        protected override void Awake()
        {
            base.Awake();
            _connection = FindObjectOfType<DojoConnection>();

            // register callbacks
            _connection.OnJoinedMatch += ToggleUI;
            _connection.OnLeftMatch += ToggleUI;
            _connection.OnRoleChanged += m => ToggleUI();


            OnTakeControlButton += OnButtonTakeControl;

            _feedbackControl = _feedbackActions.actionMaps[0];
            
            if (_elements.Contains(Elements.DISCRETE))
            {
                _feedbackControl.Enable();
            }
            //_connection.SubscribeRemoteMessages((long)NetOpCode.ShowWrittenFeedback, OnShowWrittenFeedback);

            Visible = false;
            _interface = FindAnyObjectByType<InterfaceManager>();
        }

        private void Update()
        {
            if (Visible)
            {
                if (_feedbackControl["Positive"].WasPressedThisFrame())
                {
                    OnButtonPositive();
                }
                if (_feedbackControl["Neutral"].WasPressedThisFrame())
                {
                    OnButtonNeutral();
                }
                if (_feedbackControl["Negative"].WasPressedThisFrame())
                {
                    OnButtonNegative();
                }
            }
        }
        

        private void ToggleUI()
        {
            Visible = _connection.HasJoinedMatch && _connection.Role == DojoNetworkRole.Viewer;
        }

        #region Button Callbacks


        public void OnButtonTakeControl()
        {
            var targets = _menu.SelectedFeedbackAIPlayers;


            if (targets.Count != 1)
            {
                Debug.Log("invalid selections");
                return;
            }
            int agentid = 0;
            foreach (string s in targets)
            {
                //Debug.Log(s);
                agentid = int.Parse(s.Split(char.Parse("-")).ToList().Last());
            }
            //var targetAgentIDs = targets.ConvertAll(target => int.Parse(target.Split(char.Parse("-")).ToList().Last()));

            //Debug.Log("take control");
            //if (targets.Count != 1)
            //{
            //    Debug.LogWarning($"{LOGSCOPE}: Button clicked but only 1 target client can be selected");
            //    return;
            //}


            //var targetAgentID = targetAgentIDs[0];

            if(agentid == 0)
            {
                Debug.Log("Cannot control manager agent");
                return;
            }
            _isControllingAgent = !_isControllingAgent;
            _takeControl.SetMode(_isControllingAgent ? TakeControl.Mode.ReleaseControl : TakeControl.Mode.TakeControl);
            _interface.ToggleAgent(agentid);

        }





        private void OnButtonPositive()
        {
            SendFeedback(1);
        }

        private void OnButtonNegative()
        {
            SendFeedback(-1);
        }

        private void OnButtonNeutral()
        {
            SendFeedback(0);
        }

        private void SendFeedback(float val)
        {
            var targets = _menu.SelectedFeedbackAIPlayers;
            var targetAgentIDs = targets.ConvertAll(target => int.Parse(target.Split(char.Parse("-")).ToList().Last()));

            var eventData = new List<object>() { val, targetAgentIDs };

            if (targets.Count > 0)
            {
                _connection.SendStateMessage((long)NetOpCode.Feedback, JsonWriter.ToJson(eventData));
            }
            else
            {
                Debug.LogWarning($"{LOGSCOPE}: Feedback provided but no feedback target client selected");
            }
        }

        #endregion Button Callbacks
    }
}