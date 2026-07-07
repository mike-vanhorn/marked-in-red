import Link from 'next/link'

const footerLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/map', label: 'Map' },
]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-outline-variant/30 bg-surface-container-low py-12">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo left */}
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/wordmark-horizontal.svg"
              alt="Marked in Red"
              className="h-6 w-auto"
            />
          </Link>

          {/* Nav links center */}
          <nav className="flex items-center gap-6">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-on-surface-variant hover:text-primary transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Copyright right */}
          <p className="text-sm text-on-surface-variant">
            &copy; {year} Marked in Red. Free and open.
          </p>
        </div>
      </div>
    </footer>
  )
}
