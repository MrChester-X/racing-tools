import { useEffect, useState, ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ isOpen, onClose, children }: ModalProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Используем requestAnimationFrame для более плавной анимации
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      // Ждем окончания анимации перед удалением из DOM
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 300);
  };

  if (!shouldRender) return null;

  // Используем Portal для рендеринга модалки в document.body
  return createPortal(
    <div 
      className={`fixed inset-0 bg-black flex items-center justify-center z-[9999] transition-opacity duration-300 ease-out ${
        isAnimating ? 'bg-opacity-80' : 'bg-opacity-0'
      }`}
      onClick={handleClose}
    >
      <div 
        className={`bg-gray-800 rounded-xl p-6 w-full max-w-2xl mx-6 shadow-2xl border border-gray-700 transition-all duration-300 ease-out ${
          isAnimating 
            ? 'transform scale-100 opacity-100' 
            : 'transform scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}