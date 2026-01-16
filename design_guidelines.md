# Audience Polling System - Design Guidelines

## Design Approach
**Selected Approach:** Design System (Fluent Design + Linear-inspired aesthetics)

**Justification:** This is a utility-focused, data-intensive application requiring clear hierarchy, real-time updates, and distinct role-based interfaces. Drawing from Fluent Design for data visualization and Linear for clean, modern dashboard aesthetics.

**Core Principles:**
- Clarity over decoration
- Instant feedback for all interactions
- Visual hierarchy through typography and spacing, not color
- Role-appropriate complexity (simple for audience, sophisticated for pollster)

---

## Typography

**Font Families:**
- Primary: Inter (via Google Fonts CDN)
- Monospace: JetBrains Mono (for codes, timers, vote counts)

**Hierarchy:**
- Headlines (Session names): text-2xl font-semibold
- Section titles: text-lg font-medium
- Question prompts (Audience): text-3xl md:text-4xl font-bold
- Question prompts (Dashboard): text-xl font-semibold
- Body text: text-base font-normal
- Labels/metadata: text-sm font-medium
- Codes/timers: text-xl md:text-2xl font-mono font-bold
- Vote counts (large): text-4xl md:text-5xl font-mono font-bold
- Overlay text: text-5xl md:text-6xl font-bold

---

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16, 24
- Component padding: p-4 to p-8
- Section spacing: space-y-6 or space-y-8
- Card gaps: gap-4 to gap-6
- Container padding: px-4 md:px-8

**Grid Systems:**
- Producer Console: Sidebar (280px fixed) + Main content area
- Dashboard: 2-column layout (main chart/current question + sidebar stats)
- Audience voting: Single centered column, max-w-2xl
- Overlay: Full-screen centered content with 10% safe margins

---

## Component Library

### Navigation & Controls

**Producer Sidebar:**
- Fixed left sidebar, h-full, w-70
- Session selector at top
- Run of Show list (scrollable, drag handles for reordering)
- Question state badges (Draft/Live/Closed)
- Action buttons grouped by context

**Control Buttons:**
- Primary actions (Go Live, Reveal): Larger size (h-12), prominent
- Secondary actions (Close, Hide): Medium size (h-10)
- Destructive actions (Reset): Outlined with warning icon
- Group related controls with gap-2, use button groups where appropriate

### Data Display

**Vote Counter Cards:**
- Large monospace numbers centered
- Label below in smaller text
- Optional momentum indicator (▲ ▼ with votes/sec)
- Subtle border, rounded corners (rounded-lg)

**Result Bars (Multiple Choice):**
- Full-width horizontal bars
- Option label on left, percentage on right
- Bar height: h-16 for main display, h-12 for compact
- Animate width changes (transition-all duration-300)
- Show vote count inside bar when space allows

**Segment Comparison View:**
- Toggle buttons: Overall / Room / Remote
- Stacked or side-by-side bars for comparison
- Clear segment labels with icons (🏠 Room, 🌐 Remote)

**Momentum Chart:**
- Simple line chart (use Chart.js or Recharts)
- Time on x-axis (last 5 minutes), votes on y-axis
- Grid lines subtle, chart line bold
- Show time-aligned overlay if broadcast delay > 0

**Integrity Panel:**
- Compact stat cards in grid (grid-cols-2)
- Warning indicators for anomalies (border accent when threshold exceeded)
- Top sources list with segment badges

### Audience Interface

**Join Screen:**
- Centered single-column layout (max-w-md)
- Large code input field (h-16, text-center, text-2xl, font-mono)
- Or display session name + "Ready to Vote" message if joined via link
- Segment indicator badge (subtle, top-right)

**Voting Screen:**
- Question prompt: Large, bold, top third of viewport
- Options: Stacked buttons for multiple choice
  - Each option button: h-20 md:h-24, full-width, text-xl
  - Clear tap targets with space-y-4
- Slider: Large thumb, clear value display (text-4xl above slider)
- Emoji reactions: Large emoji buttons in horizontal row (text-6xl, gap-4)
- "Vote Submitted" confirmation: Full-screen overlay, fade out after 1s

**Results Display (when revealed):**
- Same layout as voting but show bars instead of buttons
- Animate bars appearing from left
- User's vote highlighted with subtle indicator

### Overlay (Broadcast Output)

**Layout:**
- Full-screen with 10% safe margins (p-[10%])
- Question at top (text-6xl, line-height relaxed)
- Results centered below
- All text high contrast, thick font weights
- Result bars: h-24, very clear labels, large percentages

**Elements:**
- Session branding: Small logo/name area (top-left corner)
- Vote count: Large monospace number (bottom-right)
- Timer indicator if active (top-right)
- Clean, uncluttered design suitable for video overlay keying

### Forms & Inputs

**Question Builder (Producer):**
- Question type selector: Radio cards with icons
- Prompt textarea: Large, clear, h-32
- Options editor: Add/remove buttons, drag to reorder
- Settings panel: Duration timer, broadcast delay inputs (number inputs with unit labels)

**Session Creation:**
- Simple modal or dedicated page
- Session name input (text-lg)
- Auto-generated code display (font-mono, text-3xl, copy button)
- Broadcast delay setting with helper text

---

## Interaction Patterns

**Real-time Updates:**
- Fade-in new content (opacity transition, duration-200)
- Number counters: Animate digit changes
- No disruptive animations; smooth, subtle updates

**State Transitions:**
- Question state changes: Toast notifications for pollster
- Button states: Loading spinner during actions
- Disabled states clearly indicated (opacity-50, cursor-not-allowed)

**Responsiveness:**
- Producer Console: Collapse sidebar to drawer on mobile
- Dashboard: Stack columns on small screens
- Audience: Already single-column, scales naturally
- Overlay: Maintain aspect ratio, scale text proportionally

---

## Icons

**Library:** Heroicons (outline for general UI, solid for filled states)

**Usage:**
- Question type icons (CheckCircle, AdjustmentsHorizontal, FaceSmile)
- Action icons (Play, Pause, Eye, EyeSlash, ArrowPath, Lock)
- Segment icons (Home for room, Globe for remote)
- Status indicators (Clock for timer, Bolt for live)

---

## Accessibility

- High contrast text throughout (meet WCAG AA minimum)
- Clear focus indicators on all interactive elements (ring-2 ring-offset-2)
- Keyboard navigation for all producer controls
- Large tap targets for audience (minimum 44x44px)
- Screen reader labels for icon-only buttons
- Live regions for vote count updates (aria-live="polite")