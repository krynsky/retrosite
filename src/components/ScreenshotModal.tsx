import { useEffect } from "react";
import { X } from "lucide-react";

export function ScreenshotModal({
  imageUrl,
  alt,
  title,
  onClose
}: {
  imageUrl: string;
  alt: string;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="screenshot-modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="screenshot-modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="screenshot-modal-header">
          <strong>{title}</strong>
          <button type="button" className="ghost-link compact" onClick={onClose}>
            <X size={16} />
            Close
          </button>
        </div>
        <div className="screenshot-modal-scroll">
          <img src={imageUrl} alt={alt} />
        </div>
      </div>
    </div>
  );
}
