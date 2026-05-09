interface APLogoProps {
  className?: string;
  width?: number;
  height?: number;
}

const APLogo = ({ className = "", width = 32, height = 32 }: APLogoProps) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background */}
      <rect width="100" height="100" fill="#000000" rx="8"/>
      
      {/* Letter A - Orange */}
      <path
        d="M15 75 L30 25 L40 25 L55 75 L47 75 L43 60 L27 60 L23 75 Z M30 45 L40 45 L35 30 Z"
        fill="#FF8C00"
      />
      
      {/* Letter P - White */}
      <path
        d="M60 75 L60 25 L80 25 Q90 25 90 35 L90 45 Q90 55 80 55 L68 55 L68 75 Z M68 35 L68 45 L80 45 Q82 45 82 40 Q82 35 80 35 Z"
        fill="#FFFFFF"
      />
    </svg>
  );
};

export default APLogo;