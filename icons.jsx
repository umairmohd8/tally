// Small line icons — 1.5px stroke, currentColor, 24×24 viewbox
const Icon = ({ d, size = 18, stroke = 1.6, ...rest }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" width={size} height={size} {...rest}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const Icons = {
  Plus:    (p) => <Icon {...p} d={["M12 5v14", "M5 12h14"]} />,
  Check:   (p) => <Icon {...p} d="M4 12.5l5 5L20 6.5" stroke={2.2} />,
  X:       (p) => <Icon {...p} d={["M6 6l12 12", "M18 6L6 18"]} />,
  Sun:     (p) => <Icon {...p} d={["M12 3v2", "M12 19v2", "M5 12H3", "M21 12h-2", "M5.6 5.6l1.4 1.4", "M17 17l1.4 1.4", "M5.6 18.4L7 17", "M17 7l1.4-1.4"]} />,
  Moon:    (p) => <Icon {...p} d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  Flame:   (p) => <Icon {...p} d={["M12 3c2 4 6 5 6 10a6 6 0 1 1-12 0c0-3 1-4 2-5 0 2 1 3 2 3 0-3 0-6 2-8z"]} />,
  Calendar:(p) => <Icon {...p} d={["M3 8h18", "M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M8 2v4", "M16 2v4"]} />,
  Trash:   (p) => <Icon {...p} d={["M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M19 6l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"]} />,
  More:    (p) => <Icon {...p} d={["M5 12h.01", "M12 12h.01", "M19 12h.01"]} stroke={2.4} />,
  Trend:   (p) => <Icon {...p} d={["M3 17l6-6 4 4 8-8", "M14 7h7v7"]} />,
  Bell:    (p) => <Icon {...p} d={["M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z", "M10 21a2 2 0 0 0 4 0"]} />,
  Chevron: (p) => <Icon {...p} d="M9 6l6 6-6 6" />,
  Pause:   (p) => <Icon {...p} d={["M9 5v14", "M15 5v14"]} stroke={1.8} />,
  Edit:    (p) => <Icon {...p} d={["M14 4l6 6", "M3 21l3.7-.6L20 8l-4-4L4.6 16.3 3 21z"]} />,
  Cloud:   (p) => <Icon {...p} d={["M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 18 18z"]} />,
};

window.Icons = Icons;
