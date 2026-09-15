from pydantic import BaseModel


class Action(BaseModel):
    """A single low-level action for a worker agent, as produced by the option libraries."""
    done: bool
    action: int
    x: int
    y: int
    explanation: str

    def print_action(self) -> None:
        print([self.done, self.action, self.x, self.y, self.explanation])
