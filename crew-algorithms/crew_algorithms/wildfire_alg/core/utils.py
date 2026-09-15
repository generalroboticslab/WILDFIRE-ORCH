from crew_algorithms.envs.channels import ToggleTimestepChannel
from crew_algorithms.envs.configs import EnvironmentConfig
from crew_algorithms.utils.rl_utils import make_base_env
from torchrl.envs import Compose, TransformedEnv


def make_env(
    cfg: EnvironmentConfig,
    toggle_timestep_channel: ToggleTimestepChannel,
    device: str,
):
    """Creates the Unity environment the algorithms step (no observation transforms)."""
    env = TransformedEnv(
        make_base_env(cfg, device, toggle_timestep_channel=toggle_timestep_channel),
        Compose(),
    )
    return env
