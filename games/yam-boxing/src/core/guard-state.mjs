export function updateGuardState(isGuarding, toggleRequested) {
  return toggleRequested ? !isGuarding : isGuarding;
}

export function actionForGuard(isGuarding) {
  return isGuarding ? "guard" : "idle";
}

export function guardBlendForElapsed(elapsedMilliseconds, durationMilliseconds = 120) {
  return Math.max(0, Math.min(1, elapsedMilliseconds / durationMilliseconds));
}
