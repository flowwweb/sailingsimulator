export function loadBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === "true" ? true : value === "false" ? false : fallback;
  } catch {
    return fallback;
  }
}

export function saveBooleanPreference(key: string, value: boolean): boolean {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}
