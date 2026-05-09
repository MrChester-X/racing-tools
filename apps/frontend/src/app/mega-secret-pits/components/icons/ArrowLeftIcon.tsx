interface ArrowLeftIconProps {
  className?: string;
}

export default function ArrowLeftIcon({ className = "w-5 h-5" }: ArrowLeftIconProps) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5 5-5M18 12H6" />
    </svg>
  );
}