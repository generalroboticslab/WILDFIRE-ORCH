namespace Examples.Wildfire
{
    // network op code
    public enum NetOpCode
    {
        ClientAction = 0,
        ServerState = 1,
        GameEvent = 2,
        Feedback = 3,
        ImitationLearning = 4,
    }
}