interface KartChangeIconProps {
  className?: string;
}

export default function KartChangeIcon({ className = "w-5 h-5" }: KartChangeIconProps) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 4L10.59 5.41L16.17 11H6V13H16.17L10.59 18.59L12 20L20 12L12 4Z" />
    </svg>
  );
}