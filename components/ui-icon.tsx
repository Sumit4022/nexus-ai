import type { SVGProps } from "react";

export type IconName = "home" | "sparkles" | "file" | "clock" | "settings" | "user" | "edit" | "logout" | "plus" | "chevron" | "arrow";

const iconPaths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    sparkles: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
    file: <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z" /><path d="M13 3v7h7M8 14h8M8 17h8" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    settings: <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="m19.4 15 .1.1 1.2.9-1.4 2.4-1.4-.6a7.7 7.7 0 0 1-1.4.8l-.2 1.5h-2.8l-.2-1.5a7.7 7.7 0 0 1-1.4-.8l-1.4.6-1.4-2.4 1.2-.9a7.8 7.8 0 0 1 0-1.6l-1.2-.9 1.4-2.4 1.4.6a7.7 7.7 0 0 1 1.4-.8l.2-1.5h2.8l.2 1.5a7.7 7.7 0 0 1 1.4.8l1.4-.6 1.4 2.4-1.2.9a7.8 7.8 0 0 1 0 1.5Z" transform="translate(-1 -1)" /></>,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
};

export default function UiIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>{iconPaths[name]}</svg>;
}
