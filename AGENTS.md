# AGENT.md

## Skills

Always use:

- astro
- tailwind-4-docs
- web-design-guidelines
- vercel

## Design

Always follow DESIGN.md.

## Development

- Use official Astro best practices.
- Use Tailwind CSS v4 best practices.
- Prefer official documentation over assumptions.
- Keep components reusable.
- Ask before making major architectural changes.

Start the development server:

```bash
astro dev --background
```

Manage the server:

```bash
astro dev status
astro dev logs
astro dev stop
```

## Deployment

Target platform: Vercel.

Always ensure production builds succeed before considering any task complete.