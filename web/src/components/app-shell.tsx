import Link from "next/link";
import type { ReactNode } from "react";
import { hasPermission, type Role } from "@/lib/auth/roles";
import LogoutButton from "./logout-button";

type WorkspaceSection = "overview" | "batches" | "recalls" | "shipments";

type WorkspaceUser = {
  email: string;
  role: Role;
};

const navigation: { href: string; label: string; icon: string; section: WorkspaceSection }[] = [
  { href: "/", label: "Overview", icon: "▦", section: "overview" },
  { href: "/batches", label: "Inventory & batches", icon: "◫", section: "batches" },
  { href: "/recalls", label: "Recall center", icon: "⌁", section: "recalls" },
  { href: "/shipments", label: "Shipments", icon: "⇢", section: "shipments" },
];

export default function AppShell({
  active,
  user,
  children,
}: {
  active: WorkspaceSection;
  user: WorkspaceUser;
  children: ReactNode;
}) {
  const section = navigation.find((item) => item.section === active)?.label ?? "Overview";
  const visibleNavigation = navigation.filter((item) => {
    if (item.section === "overview") return hasPermission(user.role, "dashboard:read");
    if (item.section === "batches") return hasPermission(user.role, "batches:read");
    if (item.section === "recalls") return hasPermission(user.role, "recalls:read");
    return hasPermission(user.role, "warehouse-shipments:read")
      || hasPermission(user.role, "assigned-shipments:read");
  });

  return (
    <main className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">R</span>
          <span>
            Recall<span className="brand-light">Net</span>
            <small>TRACEABILITY PLATFORM</small>
          </span>
        </Link>
        <div className="side-label">WORKSPACE</div>
        <nav aria-label="Workspace" className="side-nav">
          {visibleNavigation.map((item) => (
            <Link
              aria-current={active === item.section ? "page" : undefined}
              aria-label={item.label}
              className={`nav-item${active === item.section ? " active" : ""}`}
              href={item.href}
              key={item.section}
            >
              {item.icon} <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="side-bottom">
          <span className="db-dot" /> MySQL source of truth
          <br />
          <span className="side-muted">MongoDB audit stream</span>
        </div>
      </aside>
      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            RecallNet <span>/</span> {section}
          </div>
          <div className="user-menu">
            <span aria-hidden="true" className="user-avatar">
              {user.email.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <b>{user.email}</b>
              <small>{user.role.replaceAll("_", " ")}</small>
            </span>
            <LogoutButton />
          </div>
        </header>
        <div className="content">
          {children}
          <footer className="footer">
            RecallNet <span>•</span> Product traceability and recall management
          </footer>
        </div>
      </section>
    </main>
  );
}
