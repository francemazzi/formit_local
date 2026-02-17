import { useState, useRef, useEffect } from "react";
import { User, LogOut, Shield, ChevronDown } from "lucide-react";
import type { User as UserType } from "../api/auth";

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

interface UserMenuProps {
  user: UserType;
  onLogout: () => void;
  onNavigateToAdmin?: () => void;
}

export function UserMenu({ user, onLogout, onNavigateToAdmin }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <User size={16} />
        <span className="user-email">{user.email}</span>
        <span className={`plan-badge plan-${user.plan.toLowerCase()}`}>
          {PLAN_LABELS[user.plan] || user.plan}
        </span>
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-menu-info">
            <span className="user-menu-email">{user.email}</span>
            <span className="user-menu-role">
              {user.role === "ADMIN" ? "Amministratore" : "Utente"}
            </span>
          </div>
          <div className="user-menu-divider" />
          {user.role === "ADMIN" && onNavigateToAdmin && (
            <button
              className="user-menu-item"
              onClick={() => {
                onNavigateToAdmin();
                setIsOpen(false);
              }}
            >
              <Shield size={16} />
              Pannello Admin
            </button>
          )}
          <button
            className="user-menu-item user-menu-logout"
            onClick={() => {
              onLogout();
              setIsOpen(false);
            }}
          >
            <LogOut size={16} />
            Esci
          </button>
        </div>
      )}
    </div>
  );
}
