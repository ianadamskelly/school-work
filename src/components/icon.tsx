import {
  ArrowRight, Bell, BookOpen, Building2, CalendarDays, ChartColumn,
  Check, CircleCheck, CircleAlert, ClipboardCheck, Clock, Copy, Eye,
  EyeOff, FileText, GraduationCap, History, House, Laptop, Layers,
  Lightbulb, Link, LockKeyhole, Mail, MessageSquare, MoreHorizontal,
  Paperclip, Pencil, Plus, RefreshCw, Save, Search, Send, Settings,
  ShieldCheck, Sparkles, Sun, Target, Trophy, UserRound, UsersRound,
  X, Zap, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, LogOut,
} from "lucide-react";

// Static imports keep the icon set bounded. All UI icons share a 24px grid
// and 2px stroke; callers choose 16px controls, 20px navigation or 24px cards.
const icons = {
  home: House, work: ClipboardCheck, objectives: Target, reports: ChartColumn,
  team: UsersRound, admin: Settings, daily: CalendarDays, reviews: FileText,
  calendar: CalendarDays, planned: ClipboardCheck, recurring: RefreshCw,
  reactive: Zap, cycle: RefreshCw, bolt: Zap, check: CircleCheck,
  tick: Check, clock: Clock, alert: CircleAlert, file: FileText,
  people: UsersRound, person: UserRound, sun: Sun, paperclip: Paperclip,
  clip: Paperclip, plus: Plus, arrow: ArrowRight, laptop: Laptop,
  cap: GraduationCap, target: Target, chat: MessageSquare,
  comment: MessageSquare, report: FileText, search: Search, dots: MoreHorizontal,
  link: Link, bulb: Lightbulb, history: History, chevron: ChevronRight,
  down: ChevronDown, up: ChevronUp, left: ChevronLeft, right: ChevronRight,
  sparkle: Sparkles, send: Send, save: Save, trophy: Trophy, focus: Target,
  chart: ChartColumn, shield: ShieldCheck, mail: Mail, lock: LockKeyhole,
  eye: Eye, "eye-off": EyeOff, layers: Layers, building: Building2,
  copy: Copy, edit: Pencil, book: BookOpen, bell: Bell, close: X, logout: LogOut,
};

export type IconName = keyof typeof icons;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const Glyph = icons[name];
  return <Glyph aria-hidden="true" focusable="false" strokeWidth={2} className={`inline-block shrink-0 align-middle ${className}`} />;
}
