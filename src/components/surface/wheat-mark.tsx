export function WheatMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={className}
      fill="none"
    >
      <path
        d="M16 3c.4 4.2 1.6 7.4 4.8 10.2-2.2.6-3.6 1.8-4.8 3.6-1.2-1.8-2.6-3-4.8-3.6C14.4 10.4 15.6 7.2 16 3Z"
        fill="currentColor"
      />
      <path
        d="M16 17.2c.5 3.8 1.4 6.6 4.2 9.2-1.9.4-3.2 1.3-4.2 2.6-1-1.3-2.3-2.2-4.2-2.6 2.8-2.6 3.7-5.4 4.2-9.2Z"
        fill="currentColor"
        opacity="0.7"
      />
      <path
        d="M16 4v24"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
