import { User } from 'lucide-react';

export function ChatPanel({ ref }: { ref: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={ref}
      className="flex flex-col justify-center p-4 w-275 h-125 font-sans bg-linear-to-br border-amber-500/10 from-amber-600/10 to-rose-600/10 border md:p-8"
    >
      <div className="flex items-start mb-4 mx-auto max-w-md gap-3">
        <div className="flex items-center justify-center w-8 h-8 bg-linear-to-br rounded-full from-amber-500 to-rose-500 shrink-0">
          <User className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="mb-1 text-sm text-ink font-medium">You</p>
          <div className="px-4 py-3 bg-surface-strong rounded-tl-sm border-border shadow-xs border">
            <p className="text-sm text-body leading-relaxed">
              Show me all users who signed up last month, ordered at least once, and have a subscription plan. Include
              their total spending.
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center pl-11 mx-auto max-w-md gap-2">
        <span className="text-xs text-muted">Generating SQL</span>
        <span className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
          <span className="w-1.5 h-1.5 bg-amber-600 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
        </span>
      </div>
    </div>
  );
}

export function SqlPanel({ ref }: { ref: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={ref} className="p-4 w-275 h-125 font-sans bg-[#1e1e2e] overflow-hidden md:p-8">
      <div className="flex items-center mb-4 mx-auto max-w-md gap-2">
        <div className="w-3 h-3 bg-green-500/80 rounded-full" />
        <span className="text-xs text-muted font-mono">query.sql</span>
        <div className="ml-auto">
          <span className="px-2 py-0.5 text-xs text-amber-300 font-mono bg-amber-500/20 rounded-sm border-amber-500/30 border">
            PostgreSQL
          </span>
        </div>
      </div>
      <div className="mx-auto max-w-md text-sm font-mono leading-relaxed">
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">1</div>
          <div>
            <span className="text-[#c678dd]">SELECT</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">2</div>
          <div className="pl-4">
            <span className="text-[#e5c07b]">u</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">id</span>
            <span className="text-muted">,</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">3</div>
          <div className="pl-4">
            <span className="text-[#e5c07b]">u</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">name</span>
            <span className="text-muted">,</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">4</div>
          <div className="pl-4">
            <span className="text-[#98c379]">SUM</span>
            <span className="text-body">(</span>
            <span className="text-[#e5c07b]">o</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">amount</span>
            <span className="text-body">)</span> <span className="text-[#61afef]">AS</span>{' '}
            <span className="text-[#e5c07b]">total_spent</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">5</div>
          <div>
            <span className="text-[#c678dd]">FROM</span> <span className="text-[#e5c07b]">users</span>{' '}
            <span className="text-[#e5c07b]">u</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">6</div>
          <div>
            <span className="text-[#c678dd]">JOIN</span> <span className="text-[#e5c07b]">orders</span>{' '}
            <span className="text-[#e5c07b]">o</span> <span className="text-[#c678dd]">ON</span>{' '}
            <span className="text-[#e5c07b]">u</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">id</span> <span className="text-body">=</span>{' '}
            <span className="text-[#e5c07b]">o</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">user_id</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">7</div>
          <div>
            <span className="text-[#c678dd]">WHERE</span> <span className="text-[#e5c07b]">u</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">created_at</span> <span className="text-[#c678dd]">BETWEEN</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">8</div>
          <div className="pl-8">
            <span className="text-[#56b6c2]">'2026-04-01'</span> <span className="text-[#c678dd]">AND</span>{' '}
            <span className="text-[#56b6c2]">'2026-04-30'</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">9</div>
          <div>
            <span className="text-[#c678dd]">AND</span> <span className="text-[#98c379]">EXISTS</span>{' '}
            <span className="text-body">(</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">10</div>
          <div className="pl-8">
            <span className="text-[#c678dd]">SELECT</span> <span className="text-[#56b6c2]">1</span>{' '}
            <span className="text-[#c678dd]">FROM</span> <span className="text-[#e5c07b]">subscriptions</span>{' '}
            <span className="text-[#e5c07b]">s</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">11</div>
          <div className="pl-8">
            <span className="text-[#c678dd]">WHERE</span> <span className="text-[#e5c07b]">s</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">user_id</span> <span className="text-body">=</span>{' '}
            <span className="text-[#e5c07b]">u</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">id</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">12</div>
          <div className="pl-8">
            <span className="text-[#c678dd]">AND</span> <span className="text-[#e5c07b]">s</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">status</span> <span className="text-body">=</span>{' '}
            <span className="text-[#56b6c2]">'active'</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">13</div>
          <div className="pl-8">
            <span className="text-body">)</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">14</div>
          <div>
            <span className="text-[#c678dd]">GROUP BY</span> <span className="text-[#e5c07b]">u</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">id</span>
            <span className="text-muted">,</span> <span className="text-[#e5c07b]">u</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">name</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">15</div>
          <div>
            <span className="text-[#c678dd]">HAVING</span> <span className="text-[#98c379]">COUNT</span>
            <span className="text-body">(</span>
            <span className="text-[#e5c07b]">o</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">id</span>
            <span className="text-body">)</span> <span className="text-body">{' >= '}</span>{' '}
            <span className="text-[#56b6c2]">1</span>
          </div>
        </div>
        <div className="flex">
          <div className="pr-4 w-8 text-body text-right select-none">16</div>
          <div>
            <span className="text-[#c678dd]">ORDER BY</span> <span className="text-[#e5c07b]">total_spent</span>{' '}
            <span className="text-[#c678dd]">DESC</span>
            <span className="text-muted">;</span>
          </div>
        </div>
      </div>
    </div>
  );
}
