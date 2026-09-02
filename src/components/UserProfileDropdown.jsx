import React, { useRef, useEffect, useState } from "react";
import {
  ChevronDown,
  Settings,
  Key,
  Users,
  LogOut,
  Copy,
  Check,
} from "lucide-react";
import { useAuth } from "../lib/AuthContext";

export function UserProfileDropdown() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleCopyId = () => {
    if (user?.merchantId) {
      navigator.clipboard.writeText(user.merchantId.slice(0, 8));
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleLogout = () => {
    setIsOpen(false);
    logout();
  };

  if (!user) return null;

  const initials = (user.name || "M").trim().charAt(0).toUpperCase();
  const displayName = user.name ? user.name.split(" ").slice(0, 3).join(" ") : "Merchant";

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Header Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {/* Avatar Circle */}
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex-shrink-0">
          <span className="text-sm font-bold text-white">{initials}</span>
          <div className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border border-white"></div>
        </div>

        {/* Name and Chevron */}
        <div className="hidden sm:flex items-center gap-1">
          <span className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[120px]">
            {displayName}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-500 dark:text-slate-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>

        {/* Show only chevron on mobile */}
        <div className="sm:hidden">
          <ChevronDown
            className={`h-4 w-4 text-slate-500 dark:text-slate-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* User Card Section */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex-shrink-0">
                <span className="text-lg font-bold text-white">{initials}</span>
              </div>

              {/* User Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {user.name || "Merchant Account"}
                </h3>
                {user.email && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">
                    {user.email}
                  </p>
                )}

                {/* ID Tag - Copyable */}
                {user.merchantId && (
                  <button
                    onClick={handleCopyId}
                    className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors group"
                  >
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                      ID: {user.merchantId.slice(0, 8)}
                    </span>
                    {copiedId ? (
                      <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Status Badge */}
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800">
              <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Active
              </span>
            </div>
          </div>

          {/* Navigation Items */}
          <div className="py-2">
            {/* Account Settings */}
            <button
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-3"
            >
              <Settings className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              Account Settings
            </button>

            {/* API Keys & Webhooks */}
            <button
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-3"
            >
              <Key className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              API Keys & Webhooks
            </button>

            {/* Team Management */}
            <button
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-3"
            >
              <Users className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              Team Management
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-200 dark:border-slate-700"></div>

          {/* Logout - Destructive Action */}
          <div className="p-2">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2.5 text-left text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-3 rounded-lg"
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
