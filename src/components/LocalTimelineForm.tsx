import { FormEvent, ReactNode, useState } from "react";
import { Loader2 } from "lucide-react";
import type { DepthMode } from "../types";
import { timelinePath } from "../helpers";
import { DomainField } from "./primitives/DomainField";
import { StampButton } from "./primitives/StampButton";

type LocalTimelineFormProps = {
  idleIcon: ReactNode;
};

export default function LocalTimelineForm({ idleIcon }: LocalTimelineFormProps) {
  const [domain, setDomain] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [depthMode, setDepthMode] = useState<DepthMode>("adaptive");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!domain.trim()) return;

    setSubmitLoading(true);
    setSubmitError("");

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: domain.trim(), depthMode })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create timeline job.");
      }

      const host = payload.host ?? domain.trim().replace(/^https?:\/\//, "");
      window.location.assign(timelinePath(host));
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "Unable to create timeline job.");
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <>
      <form className="domain-block" onSubmit={handleSubmit}>
        <DomainField
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="example.com/path"
          required
          aria-label="Domain or path"
        />
        <label className="depth-field">
          <span className="depth-field-label">DEPTH</span>
          <select
            value={depthMode}
            onChange={(event) => setDepthMode(event.target.value as DepthMode)}
            aria-label="Timeline depth"
          >
            <option value="adaptive">Adaptive</option>
            <option value="quick">Quick</option>
            <option value="standard">Standard</option>
            <option value="deep">Deep</option>
          </select>
        </label>
        <StampButton
          type="submit"
          tone="primary"
          size="lg"
          disabled={submitLoading}
          icon={submitLoading ? <Loader2 className="spin" size={18} aria-hidden="true" /> : idleIcon}
        >
          Create Timeline
        </StampButton>
      </form>
      {submitError && <p className="error-note">{submitError}</p>}
    </>
  );
}
