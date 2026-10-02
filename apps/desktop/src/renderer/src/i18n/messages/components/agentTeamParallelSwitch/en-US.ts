export default {
  title: "Run subagents in parallel",
  description:
    "Applies to the whole team: when the primary agent delegates several independent subtasks at once, up to {arg0} run at the same time and the primary agent waits for all of them. Writes to the work are applied one at a time, and the primary agent decides the order of tasks that touch the same object; token usage grows with parallelism."
};
