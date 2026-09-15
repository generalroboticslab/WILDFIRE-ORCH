using UnityEngine;
using Unity.MLAgents;
using Unity.MLAgents.Sensors;
using Unity.MLAgents.Actuators;
using System;
using Dojo;
using System.Collections.Generic;
using System.Linq;
using System.Collections;



namespace Examples.Wildfire
{
    public class AIAgent : Agent
    {

        public ControllerType controllerType;
        private DojoConnection _connection;
        private float _feedbackReceived = 0;
        private int _trajectoryID = 0;

        private bool _isDone = false;
        private bool _isActive = true;
        [Tooltip("Request decision every N seconds")]
        [SerializeField] private float _decisionRequestFrequency = 1f;
        [SerializeField] private bool _repeatActions = false;
        private AIAction _lastAction = AIAction.NO_MOVE;

        public int AgentId;

        private GameManager _gameManager;
        private AIAgentManager _agentManager;
        public PlayerController controller;

        public bool IsPlayerAlive;
        private bool _imitationLearning = false;
        public float[] HumanActionArray;
        public MapManager map;
        
        // Replay mode fields
        private bool _isReplayMode = false;
        private List<float[]> _replayTrajectory;
        private int _currentReplayIndex = 0;

        private int fixedUpdateCount = 0;
        private bool skippedfirstaction = false;

        protected override void Awake()
        {
            IsPlayerAlive = true;

            Application.targetFrameRate = 50;
            base.Awake();
            _connection = FindObjectOfType<DojoConnection>();
            _connection.SubscribeRemoteMessages((long)NetOpCode.Feedback, OnRemoteFeedback);
            _connection.SubscribeRemoteMessages((long)NetOpCode.ImitationLearning, OnImitationLearning);
            _connection.SubscribeRemoteMessages((long)NetOpCode.ClientAction, OnClientAction);
            HumanActionArray = new float[3];
            map = FindObjectOfType<MapManager>();




#if UNITY_STANDALONE // && !UNITY_EDITOR
            var args = Environment.GetCommandLineArgs();

            for (var idx = 0; idx < args.Length; ++idx)
            {
                var arg = args[idx];

                if (arg.Equals("-DecisionRequestFrequency") && idx < args.Length - 1 && float.TryParse(args[idx + 1], out var requestFreq))
                {
                    _decisionRequestFrequency = requestFreq;
                    ++idx;
                }
                _decisionRequestFrequency = 2f;
                InvokeRepeating(nameof(DecisionRequestLoop), 2.0f, _decisionRequestFrequency);
            }

#endif

            _gameManager = FindObjectOfType<GameManager>();
            _agentManager = FindObjectOfType<AIAgentManager>();
        }
        public override void CollectObservations(VectorSensor sensor)
        {
            if (!_connection.IsClient)
            {
                //sensor.AddObservation(_feedbackReceived);
                _feedbackReceived = 0;

                //sensor.AddObservation(Time.realtimeSinceStartup);
                //sensor.AddObservation(_trajectoryID);


                int max_data = 61*61;
                int dataRange = (int)MapManager.miniMapRanges[(int)controllerType];

                sensor.AddObservation((int)controllerType);



                if(controllerType != ControllerType.Manager && controllerType != ControllerType.Default)
                {
                    for (int j = (int)controller.gridPos.y - dataRange; j <= (int)controller.gridPos.y + dataRange; j++)
                    {
                        for (int i = (int)controller.gridPos.x - dataRange; i <= (int)controller.gridPos.x + dataRange; i++)
                        {
                            if (i>=0 && i < MapManager.mapSize.x && j >= 0 && j < MapManager.mapSize.y)
                            {
                                sensor.AddObservation(map.AccDataMap[i, j]);
                            }
                            else
                            {
                                sensor.AddObservation(0);
                            }
                            max_data -= 1;
                        }
                    }
                    while (max_data > 0)
                    {
                        sensor.AddObservation(-1);
                        max_data -= 1;
                    }

                    sensor.AddObservation((_imitationLearning==true)?(1):(0));
                    sensor.AddObservation((int)controller.gridPos.x);
                    sensor.AddObservation((int)controller.gridPos.y);
                    foreach (int i in controller.extraVariables)
                    {
                        sensor.AddObservation(i);
                    }

                }
                else if(controllerType == ControllerType.Manager)
                {
                    for (int i = 0; i < max_data + 6; i++)
                    {

                        if (i < GameManager.returnVariables.Count)
                        {
                            sensor.AddObservation(GameManager.returnVariables[i]);
                        }
                        else if (i == max_data + 5) // Last slot: fire status
                        {
                            // 1 = fire cells still active, 0 = no active fire
                            sensor.AddObservation(MapManager.fire_active ? 1 : 0);
                        }
                        else
                        {
                            sensor.AddObservation(-1);
                        }

                    }

                }
                // Default
                else
                {
                    for(int i = 0; i<max_data+6; i++)
                    {
                        sensor.AddObservation(-1);
                    }

                }

            }
        }

        public override void OnActionReceived(ActionBuffers actions)
        {


            float[] continuousActions = new float[actions.ContinuousActions.Length];
            int idx = 0;
            foreach (float a in actions.ContinuousActions)
            {
                continuousActions[idx] = a;
                idx += 1;
            }

            bool normalized = false;
            if (normalized)
            {
                continuousActions[0] = (float)((int)(continuousActions[0] * 5));
                continuousActions[1] = (continuousActions[1] - 0.5f) * MapManager.mapSize.x;
                continuousActions[2] *= (continuousActions[2] - 0.5f) * MapManager.mapSize.y;
            }


            float[] actionArray = continuousActions;
            //Debug.Log(actionArray);

            //if (controllerType == ControllerType.Firefighter)
            //{
            //    actionArray = new float[] { (float)((int)(UnityEngine.Random.value * 4f)), UnityEngine.Random.Range(-200f, 200f), UnityEngine.Random.Range(-200f, 200f) };
            //}
            //else if (controllerType == ControllerType.Bulldozer)
            //{
            //    actionArray = new float[] { (float)((int)(UnityEngine.Random.value*2f)), UnityEngine.Random.Range(-200f, 200f), UnityEngine.Random.Range(-200f, 200f) };
            //}
            //else if (controllerType == ControllerType.Drone)
            //{
            //    actionArray = new float[] { UnityEngine.Random.Range(-200f, 200f), UnityEngine.Random.Range(-200f, 200f) };
            //}
            //else if (controllerType == ControllerType.Helicopter)
            //{
            //    actionArray = new float[] { (float)((int)(UnityEngine.Random.value * 1f)), UnityEngine.Random.Range(-200f, 200f), UnityEngine.Random.Range(-200f, 200f) };
            //}
            //else if(controllerType == ControllerType.Manager)
            //{
            //    actionArray = new float[] { (float)((int)(UnityEngine.Random.value * 1f))};
            //}
            //else
            //{
            //    actionArray = new float[] { (float)((int)(UnityEngine.Random.value * 1f)), UnityEngine.Random.Range(-200f, 200f), UnityEngine.Random.Range(-200f, 200f) };
            //}

            if(controllerType == ControllerType.Manager)
            {
                //actionArray = new float[] { (float)((int)(UnityEngine.Random.value * 5f)) };
            }

            //Debug.Log(AgentId.ToString() + " received action " + actionArray);

            ExecuteAction(actionArray);
            
            if (_isDone)
            {
                EndEpisode();
                _isDone = false;
            }

        }

        private void ExecuteAction(float[] actionArray)
        {
            if (!_connection.IsServer)
            {
                return;
            }
            if (_imitationLearning)
            {
                //actionArray = HumanActionArray;
            }

            if (controllerType == ControllerType.Manager)
            {
                switch (actionArray[0])
                {
                    case (0f):
                        // Do nothing
                        break;
                    case (1f):
                        //_agentManager.SpawnAgent(ControllerType.Firefighter, new Vector3(0, 0, 0));
                        break;
                    case (2f):
                        //_agentManager.SpawnAgent(ControllerType.Bulldozer, new Vector3(0, 0, 0));
                        break;
                    case (3f):
                        //_agentManager.SpawnAgent(ControllerType.Drone, new Vector3(0, 0, 0));
                        break;
                    case (4f):
                        //_agentManager.SpawnAgent(ControllerType.Helicopter, new Vector3(0, 0, 0));
                        break;
                    case (5f):
                        // Start fire at location
                        map.SetFire(actionArray[1], actionArray[2]);
                        break;
                    case (6f):
                        // Trigger X fire simulation steps
                        int simSteps = (int)actionArray[1];
                        if (simSteps < 1) simSteps = 1;
                        for (int i = 0; i < simSteps; i++)
                        {
                            map.SimStep();
                        }
                        break;
                    case (7f):
                        // Add water at location
                        map.setWater(new Vector2(actionArray[1], actionArray[2]));
                        break;
                    case (8f):
                        // Remove water at location
                        map.RemoveWater(new Vector2(actionArray[1], actionArray[2]));
                        break;
                    case (9f):
                        // Spawn 1 civilian at location
                        map.SpawnCivilians(1, new Vector2(actionArray[1], actionArray[2]));
                        break;
                    case (10f):
                        // Spawn 5 civilians at location
                        map.SpawnCivilians(5, new Vector2(actionArray[1], actionArray[2]));
                        break;
                    case (11f):
                        // Destroy/remove agent by ID
                        _agentManager.DestroyAgent((int)actionArray[1]);
                        break;
                }
                return;
            }

            if (controllerType != ControllerType.Default)
            {
                if (_isReplayMode)
                {
                    if (_currentReplayIndex < _replayTrajectory.Count)
                    {
                        actionArray = _replayTrajectory[_currentReplayIndex];
                        Debug.Log($"Agent {AgentId} executing replay action {_currentReplayIndex + 1}/{_replayTrajectory.Count}: [{string.Join(", ", actionArray)}]");

                        _currentReplayIndex++;
                    }
                    else
                    {
                        Debug.Log($"Agent {AgentId} completed replay trajectory");
                        _isReplayMode = false;
                    }
                }

                if (!this.skippedfirstaction)
                    {
                        actionArray[0] = -1f;
                        skippedfirstaction = true;
                    }

                controller.HandleActionArray(actionArray);
            }

        }


        private void DecisionRequestLoop()
        {
            if(IsPlayerAlive)
            {
                RequestDecision();
            }
        }

        private void OnFrameEnded(int frameCount, int score)
        {
            AddReward(score);
        }

        private void OnGameEnded()
        {
            _isDone = true;
        }

        private void OnRemoteFeedback(DojoMessage m)
        { 
            var feedbackMessage = m.GetDecodedData<List<object>>();
            float feedback = Convert.ToSingle(feedbackMessage[0]);
            List<int> targets = (feedbackMessage[1] as IEnumerable<object>).Cast<object>().Cast<int>().ToList();
            if (targets.Contains(AgentId))
                _feedbackReceived += feedback;
        }

        public IEnumerator WaitAndStartRequestingDecisions()
        {
            yield return null; // waits one frame
            if (!_connection.IsServer)
                yield return null;
            _isActive = true;
        }
        public void StartRequestingDecisions()
        {

            if (!_connection.IsServer)
                return;
            _isActive = true;
        }
        public void ResetAgent()
        {
            WaitAndStartRequestingDecisions();
            return;
            _isActive = false;
            _trajectoryID += 1;
            _lastAction = AIAction.NO_MOVE;
            Debug.Log($"Reset Agent: {AgentId}");
            controller.ResetGameState();
            WaitAndStartRequestingDecisions();

        }
        private void OnImitationLearning(DojoMessage m)
        {

            //Debug.Log("imitation learning:" + AgentId);
            var imitationLearningMessage = m.GetDecodedData<List<object>>();
            int target = (int)imitationLearningMessage[0];
            _imitationLearning = target == AgentId ? !_imitationLearning : false;
            HumanActionArray = new float[3] { 0f, transform.position.x, transform.position.z };
        }

        private void OnClientAction(DojoMessage m)
        {

            var clientActionMessage = m.GetDecodedData<List<float>>();
            int target = (int)clientActionMessage[0];
            if(target == AgentId)
            {
                HumanActionArray = new float[3] { 0f, (float)clientActionMessage[2], (float)clientActionMessage[3] };
            }
        }

        public void SetReplayMode(bool isReplayMode, List<float[]> trajectory = null)
        {
            _isReplayMode = isReplayMode;
            _currentReplayIndex = 0;
            _replayTrajectory = trajectory;
        }

        public bool IsInReplayMode()
        {
            return _isReplayMode;
        }
    }
}