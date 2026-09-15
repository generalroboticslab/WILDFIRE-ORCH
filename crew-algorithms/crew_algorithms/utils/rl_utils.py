import os
import platform

from crew_algorithms.envs.channels import ToggleTimestepChannel
from crew_algorithms.envs.configs import EnvironmentConfig
from crew_algorithms.envs.unity import UnityEnv
from crew_algorithms.utils.common_utils import find_free_port
from mlagents_envs.side_channel.engine_configuration_channel import (
    EngineConfigurationChannel,
)


def make_base_env(
    env_cfg: EnvironmentConfig,
    device: str,
    toggle_timestep_channel: ToggleTimestepChannel | None = None,
):
    """Creates the base Unity environment (no transforms applied).

    Args:
        env_cfg: The environment configuration.
        device: The device to perform environment operations on.
        toggle_timestep_channel: A Unity side channel used to play/pause the game.

    Returns:
        A `UnityEnv` object that can be used to interact with the environment.
    """
    if "Linux" in platform.system():
        env_cfg.unity_server_build_path = env_cfg.unity_server_build_path_linux
    elif "Darwin" in platform.system():
        env_cfg.unity_server_build_path = env_cfg.unity_server_build_path_osx
    elif "Windows" in platform.system():
        env_cfg.unity_server_build_path = env_cfg.unity_server_build_path_windows
    else:
        raise ValueError("Unsupported platform")

    num_player_args = []
    if hasattr(env_cfg, "num_agents") and hasattr(env_cfg, "starting_firefighter_agents") and hasattr(env_cfg, "starting_bulldozer_agents") and hasattr(env_cfg, "starting_drone_agents") and hasattr(env_cfg, "starting_helicopter_agents"):
        num_player_args = [
            "-NumAgents", f"{env_cfg.num_agents}",
            "-StartingFirefighterAgents", f"{env_cfg.starting_firefighter_agents}",
            "-StartingBulldozerAgents", f"{env_cfg.starting_bulldozer_agents}",
            "-StartingDroneAgents", f"{env_cfg.starting_drone_agents}",
            "-StartingHelicopterAgents", f"{env_cfg.starting_helicopter_agents}",
        ]
    elif hasattr(env_cfg, "num_agents"):
        num_player_args = ["-NumAgents", f"{env_cfg.num_agents}"]

    cam_size_arg = []
    if hasattr(env_cfg, "server_cam_size"):
        cam_size_arg = ["-ServerCamSize", f"{env_cfg.server_cam_size}"]

    log_trajectory_arg = []
    if hasattr(env_cfg, "log_trajectory"):
        log_trajectory_arg = ["-LogTrajectory", "1"] if env_cfg.log_trajectory else ["-LogTrajectory", "0"]

    map_args = []
    if hasattr(env_cfg, "map_size"):
        map_args = ["-MapSize", f"{env_cfg.map_size}"]
    seed_args = []
    if hasattr(env_cfg, "seed"):
        seed_args = ["-Seed", f"{env_cfg.seed}"]

    # Written feedback (an old CREW feature) is always off for Wildfire
    feedback_args = ["-Written_feedback", "0"]

    maze_args = []
    if hasattr(env_cfg, "rand_maze"):
        maze_args = ["-RandMaze", "1"] if env_cfg.rand_maze else ["-RandMaze", "0"]

    algorithm_args = []
    if hasattr(env_cfg, "algorithm"):
        algorithm_args = ["-Algorithm", env_cfg.algorithm]

    render_folder_path_args = []
    if hasattr(env_cfg, "render_folder_path"):
        render_folder_path_args = ["-RenderFolderPath", str(env_cfg.render_folder_path)]

    timestamp_args = []
    if hasattr(env_cfg, "timestamp"):
        timestamp_args = ["-Timestamp", str(env_cfg.timestamp)]

    team_generation_type_args = []
    if hasattr(env_cfg, "team_generation_type"):
        team_generation_type_args = ["-TeamGenerationType", str(env_cfg.team_generation_type)]

    level_args = []
    if hasattr(env_cfg, "level"):
        level_args = ["-Level", env_cfg.level]

    accum_margin_args = []
    if hasattr(env_cfg, "accumulative_margin"):
        accum_margin_args = ["-AccumulativeMargin", str(env_cfg.accumulative_margin)]

    game_args = []
    if hasattr(env_cfg, "game_type"):
        game_args = [
            "-GameType", f"{env_cfg.game_type}",
            "-Lines", "1" if env_cfg.lines else "0",
            "-TreeCount", f"{env_cfg.tree_count}",
            "-TreesPerLine", f"{env_cfg.trees_per_line}",
            "-FireSpreadSpeed", f"{env_cfg.fire_spread_frequency}",
            "-Water", "1" if env_cfg.water else "0",
            "-CivilianCount", f"{env_cfg.civilian_count}",
            "-CivilianClusters", f"{env_cfg.civilian_clusters}",
            "-CivilianMoveSpeed", f"{env_cfg.civilian_move_frequency}",
            "-VegetationDensityOffset", f"{env_cfg.vegetation_density_offset}"
        ]

    channel_args = []
    side_channels = []
    if toggle_timestep_channel:
        side_channels.append(toggle_timestep_channel)
        channel_args += [
            "-ToggleTimestepChannelID",
            str(toggle_timestep_channel.channel_id),
        ]

    engine_configuration_channel = EngineConfigurationChannel()
    side_channels.append(engine_configuration_channel)

    if env_cfg.time_scale > 1.0:
        engine_configuration_channel.set_configuration_parameters(
            width=100,
            height=100,
            quality_level=10,
            time_scale=env_cfg.time_scale,
            target_frame_rate=50,
        )
    os.makedirs(str(env_cfg.log_folder_path), exist_ok=True)

    base_env = UnityEnv(
        str(env_cfg.unity_server_build_path),
        seed=env_cfg.seed,
        no_graphics=env_cfg.no_graphics,
        side_channels=side_channels,
        additional_args=[
            *channel_args,
            *num_player_args,
            *seed_args,
            *feedback_args,
            *maze_args,
            *cam_size_arg,
            *log_trajectory_arg,
            *game_args,
            *map_args,
            *algorithm_args,
            *render_folder_path_args,
            *timestamp_args,
            *team_generation_type_args,
            *level_args,
            *accum_margin_args,
        ],
        log_folder=str(env_cfg.log_folder_path),
        base_port=find_free_port(),
        timeout_wait=60 * 60 * 24,
        device=device,
        frame_skip=1,
    )
    return base_env
