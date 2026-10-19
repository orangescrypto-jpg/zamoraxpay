# ZamoraxPay UI Improvements

UI/UX polish only — **no database, migrations, or API changes**.

## Added

### Design system (`components/ui/`)
Button, Input, Label, Textarea, Card, Badge, Alert, Skeleton, Spinner, EmptyState, ResultBanner

### Theme
- `theme-provider.tsx` + `theme-toggle.tsx` (light / dark / system)
- Anti-FOUC script in root layout
- ThemeProvider in SiteChrome
- Toggle in Header + Appearance section in Settings

### Page updates
- Dashboard activity: Skeleton loaders, theme-aware empty states
- Airtime: ResultBanner for purchase results
- Login: ResultBanner for errors
- Settings: Appearance / theme control
- Header & MobileBottomNav: theme-aware surfaces (`bg-card`)

## Usage

```tsx
import { Button, Input, ResultBanner, Skeleton } from "@/components/ui"
import { ThemeToggle } from "@/components/theme-toggle"
```

Migrate remaining service pages to Button/Input/ResultBanner using the airtime pattern.
