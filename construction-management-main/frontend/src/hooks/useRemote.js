import { useEffect, useState } from "react";
import { api } from "../services/operationsApi";

export default function useRemote(path, refreshKey = "") {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ path: null, loading: true, data: null, error: null });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api(path, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setState({ path, loading: false, data, error: null });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ path, loading: false, data: null, error });
    });
    return () => controller.abort();
  }, [path, attempt, refreshKey]);
  const reload = () => {
    setState({ path, loading: Boolean(path), data: null, error: null });
    setAttempt((value) => value + 1);
  };
  return { ...(state.path === path ? state : { loading: Boolean(path), data: null, error: null }), reload };
}
