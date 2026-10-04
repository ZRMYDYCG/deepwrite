export default {
  drawMode: "Draw mode",
  drawHint:
    "Runs each task several times in the background and hands only the selected result to the primary agent.",
  onlyAvailableInPureModes:
    "Pure modes only. Standard members have write tools, so repeated runs would edit the work again and again.",
  enabledHint:
    "Each delegation produces {arg0} results and hands back only the selected one, at about {arg0}× the usage.",
  enabledHintAuto:
    "Each delegation produces {arg0} results and the evaluator hands back the best one, at about {arg0}× the usage plus one evaluation.",
  drawCount: "Draws",
  countValue: "{arg0} times",
  selection: "Selection",
  manual: "Manual",
  auto: "Automatic",
  manualHint: "When every draw is done, a picker card lets you choose.",
  autoHint:
    "When every draw is done, the evaluator picks one by its rules. If it can't, you choose instead.",
  evaluator: "Evaluator",
  evaluationRules: "Evaluation rules",
  restoreDefault: "Restore default",
  evaluatorBoundaryHint:
    "The evaluator sees only the task and the candidates, not the work, and is always required to submit its choice through the select tool."
};
