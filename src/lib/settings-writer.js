import { serializeMutation } from "./persistence.js";

export function createSettingsWriter({ getConfirmed, persist, commit }) {
  return (patch) =>
    serializeMutation("settings:global", async () => {
      const next = { ...getConfirmed(), ...patch };
      const confirmed = await persist(next, patch);
      commit(confirmed);
      return confirmed;
    });
}
