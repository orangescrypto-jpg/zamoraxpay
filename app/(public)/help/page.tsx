// app/(public)/help/page.tsx
// Static FAQ / Help Center page. No DB / API needed - all content is
// authored here and shipped with the build. Addresses audit
// recommendation #24 "In-app FAQ / Help Center".

import Link from "next/link"
import { HelpCircle, MessageCircle, Wallet, ShieldCheck, Gift, User } from "lucide-react"
import { FAQAccordion } from "@/components/shared/FAQAccordion"

export const revalidate = 3600 // 1 hour - content rarely changes

export const metadata = {
  title: "Help Center - Frequently Asked Questions",
  description: "Find answers to common questions about wallet funding, purchases, refunds, security, rewards, and your ZamoraxPay account.",
}

interface QA { q: string; a: string }
interface FaqCategory { id: string; title: string; icon: typeof Wallet; items: QA[] }

const FAQS: FaqCategory[] = [
  {
    id: "wallet",
    title: "Wallet & funding",
    icon: Wallet,
    items: [
      {
        q: "How do I fund my wallet?",
        a: "Open the Wallet page, enter the amount you want to add (minimum is 100 naira), and tap Fund wallet. You will be redirected to our payment partner (Korapay or Paystack) to complete the payment with your card or bank transfer. Once the payment is confirmed, your wallet is credited automatically.",
      },
      {
        q: "Why hasn't my wallet been credited after funding?",
        a: "Most payments credit instantly. If yours didn't, wait 1 to 2 minutes - the payment partner sometimes takes a moment to send the confirmation webhook. If it's still not credited after 5 minutes, the Wallet page has a Retry balance button. If that doesn't help, contact support with your payment reference.",
      },
      {
        q: "What's the minimum amount I can fund?",
        a: "The minimum wallet funding is 100 naira. There's no maximum, but very large single deposits may require additional verification from the payment partner.",
      },
      {
        q: "Is my wallet balance safe if my phone is stolen?",
        a: "Yes. Your wallet is tied to your account, not your phone. Sign in from any device with your email and password. We recommend setting a transaction PIN in Settings so no one can make purchases from your account even if they have your unlocked phone.",
      },
    ],
  },
  {
    id: "purchases",
    title: "Purchases",
    icon: HelpCircle,
    items: [
      {
        q: "How fast is delivery?",
        a: "Airtime, data, and exam PINs are delivered instantly (usually under 10 seconds). Cable TV and electricity tokens may take up to 30 seconds depending on the provider. If your order is still pending after 2 minutes, check your transaction history - the order will show its current status.",
      },
      {
        q: "What happens if a purchase fails?",
        a: "We route every purchase through multiple providers. If the first one fails, we automatically try the next. If every provider fails, your money is refunded to your wallet automatically - you don't need to contact support for a refund in this case.",
      },
      {
        q: "Can I buy airtime or data for someone else?",
        a: "Yes. Just enter their phone number instead of yours. We'll detect the network from the number and warn you if it doesn't match the network you selected - airtime sent to the wrong network can't be refunded, so always double-check before confirming.",
      },
      {
        q: "What is the minimum airtime purchase?",
        a: "The minimum airtime purchase is 50 naira. There's no maximum, but very large single purchases may trigger a fraud-prevention review.",
      },
      {
        q: "Do you support bulk purchases?",
        a: "Yes. From the dashboard, tap Bulk Airtime or Bulk Data to send to many phone numbers at once. You can also save groups of numbers as contact batches for repeat use.",
      },
    ],
  },
  {
    id: "refunds",
    title: "Refunds & withdrawals",
    icon: Wallet,
    items: [
      {
        q: "How long do refunds take?",
        a: "Refunds for failed purchases are instant - the money returns to your wallet as soon as every provider has been tried. There's no separate refund request to make.",
      },
      {
        q: "Can I withdraw my wallet balance to my bank account?",
        a: "Yes, with two important rules: (1) you can only withdraw to a bank account you've previously funded your wallet from, and (2) only your funded balance and referral bonus are withdrawable. Cashback is spend-only - you can use it for purchases but can't withdraw it to a bank.",
      },
      {
        q: "What's the minimum withdrawal?",
        a: "The minimum withdrawal amount and any withdrawal fee are configurable by the admin in Site Settings. The current values are shown on the withdrawal form before you confirm.",
      },
      {
        q: "How long does a withdrawal take to reach my bank?",
        a: "Withdrawals are processed in batches. Most land in your bank account within a few hours; some can take up to one business day depending on your bank. If it's been more than 24 hours, contact support with your withdrawal reference.",
      },
    ],
  },
  {
    id: "security",
    title: "Security & PIN",
    icon: ShieldCheck,
    items: [
      {
        q: "What is a transaction PIN and why do I need one?",
        a: "Your transaction PIN is a 4-digit code that's required for every purchase. It prevents anyone with access to your unlocked phone from spending your wallet. Set it up in Settings - we strongly recommend doing this before funding your wallet.",
      },
      {
        q: "I forgot my transaction PIN. How do I reset it?",
        a: "Go to Settings, tap Reset transaction PIN, and follow the prompts. For your security, resetting requires verifying your identity through your email.",
      },
      {
        q: "Is my BVN required?",
        a: "BVN is only required if you want to upgrade to a Reseller account for wholesale pricing. Regular users never need to provide BVN.",
      },
      {
        q: "How do I report suspicious activity on my account?",
        a: "Open the Contact page and reach us by email or WhatsApp. Include the transaction reference if you have one. We can freeze your wallet temporarily while we investigate.",
      },
    ],
  },
  {
    id: "rewards",
    title: "Referrals & rewards",
    icon: Gift,
    items: [
      {
        q: "How does the referral program work?",
        a: "Share your referral link from the Referrals page. When someone signs up using your link and makes their first purchase, both of you receive a bonus credited to your wallet. The bonus is withdrawable to your bank account.",
      },
      {
        q: "What is cashback?",
        a: "Cashback is a small percentage of your purchase amount that's returned to your cashback balance. It's spend-only - you can use it for future purchases but can't withdraw it to a bank. Claim your accumulated cashback from the Rewards page.",
      },
      {
        q: "How does the daily check-in streak work?",
        a: "Tap Check in on the Daily Streak page once per day. Each consecutive day increases your streak and earns more rewards. If you miss a day, the streak resets - unless you have a streak shield token, which forgives one missed day.",
      },
      {
        q: "What are Spin & Win tickets?",
        a: "Spin tickets are earned through purchases, deposits, referrals, and daily streak milestones. Each ticket gives you a chance to win wallet credit, airtime/data vouchers, or purchase discounts. Tickets don't expire the same day - check the Spin page for expiry dates.",
      },
    ],
  },
  {
    id: "account",
    title: "Account",
    icon: User,
    items: [
      {
        q: "How do I change my phone number or email?",
        a: "Currently, account phone and email can't be changed in-app for security reasons. Contact support with proof of identity and we'll update it for you.",
      },
      {
        q: "Can I have more than one account?",
        a: "No. Having multiple accounts violates our terms of service and may result in all associated accounts being suspended. If you need a separate account for a business, consider the Reseller upgrade instead.",
      },
      {
        q: "How do I delete my account?",
        a: "Contact support from the email registered to your account. We'll process the deletion after verifying your identity and ensuring any pending transactions are settled.",
      },
      {
        q: "Is there a mobile app?",
        a: "ZamoraxPay is a Progressive Web App (PWA). On Android, you can install it from Chrome's menu - it'll appear on your home screen like a native app. On iOS, use Safari's Share menu and tap Add to Home Screen.",
      },
    ],
  },
]

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <HelpCircle className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-3xl font-heading font-bold text-secondary">Help Center</h1>
        <p className="mt-2 text-muted-foreground">
          Find answers to common questions. Can&apos;t find what you&apos;re looking for?{" "}
          <Link href="/contact" className="font-medium text-primary hover:underline">Contact support</Link>.
        </p>
      </div>

      <div className="mt-10 space-y-8">
        {FAQS.map((cat) => (
          <section key={cat.id} aria-labelledby={`${cat.id}-title`}>
            <h2 id={`${cat.id}-title`} className="flex items-center gap-2 text-lg font-heading font-semibold text-secondary">
              {cat.icon ? <cat.icon className="h-5 w-5 text-primary" /> : null}
              {cat.title}
            </h2>
            <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card shadow-sm">
              {cat.items.map((item, i) => (
                <FAQAccordion
                  key={i}
                  question={item.q}
                  answer={item.a}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Quick contact CTA at the bottom */}
      <div className="mt-12 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-heading font-semibold text-secondary">Still need help?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Reach a real person by email or WhatsApp. We respond during business hours, usually within a few hours.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/contact" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Contact support</Link>
              <Link href="/refund" className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-secondary hover:bg-muted">Refund policy</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
