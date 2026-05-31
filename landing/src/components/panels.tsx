import { User } from 'lucide-react';

export function ChatPanel({ ref }: { ref: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={ref}
      className="bg-linear-to-br from-amber-600/10 to-rose-600/10 p-4 md:p-8 w-275 h-125 flex flex-col justify-center font-sans border border-amber-500/10"
    >
      <div className="flex items-start gap-3 mb-4 max-w-md mx-auto">
        <div className="w-8 h-8 rounded-full bg-linear-to-br from-amber-500 to-rose-500 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-ink mb-1">You</p>
          <div className="bg-surface-strong rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-border">
            <p className="text-sm text-body leading-relaxed">
              Show me all users who signed up last month, ordered at least once, and have a subscription plan. Include
              their total spending.
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 max-w-md mx-auto pl-11">
        <span className="text-xs text-muted">Generating SQL</span>
        <span className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" style={{ animationDelay: '0.2s' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" style={{ animationDelay: '0.4s' }} />
        </span>
      </div>
    </div>
  );
}

export function SqlPanel({ ref }: { ref: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={ref} className="bg-[#1e1e2e] p-4 md:p-8 w-275 h-125 font-sans overflow-hidden">
      <div className="flex items-center gap-2 mb-4 max-w-md mx-auto">
        <div className="w-3 h-3 rounded-full bg-green-500/80" />
        <span className="text-xs font-mono text-muted">query.sql</span>
        <div className="ml-auto">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
            PostgreSQL
          </span>
        </div>
      </div>
      <div className="font-mono text-sm leading-relaxed max-w-md mx-auto">
        <div className="flex">
          <div className="text-body text-right pr-4 select-none w-8">1</div>
          <div>
            <span className="text-[#c678dd]">SELECT</span>
          </div>
        </div>
        <div className="flex">
          <div className="text-body text-right pr-4 select-none w-8">2</div>
          <div className="pl-4">
            <span className="text-[#e5c07b]">u</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">id</span>
            <span className="text-muted">,</span>
          </div>
        </div>
        <div className="flex">
          <div className="text-body text-right pr-4 select-none w-8">3</div>
          <div className="pl-4">
            <span className="text-[#e5c07b]">u</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">name</span>
            <span className="text-muted">,</span>
          </div>
        </div>
        <div className="flex">
          <div className="text-body text-right pr-4 select-none w-8">4</div>
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
          <div className="text-body text-right pr-4 select-none w-8">5</div>
          <div>
            <span className="text-[#c678dd]">FROM</span> <span className="text-[#e5c07b]">users</span>{' '}
            <span className="text-[#e5c07b]">u</span>
          </div>
        </div>
        <div className="flex">
          <div className="text-body text-right pr-4 select-none w-8">6</div>
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
          <div className="text-body text-right pr-4 select-none w-8">7</div>
          <div>
            <span className="text-[#c678dd]">WHERE</span> <span className="text-[#e5c07b]">u</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">created_at</span> <span className="text-[#c678dd]">BETWEEN</span>
          </div>
        </div>
        <div className="flex">
          <div className="text-body text-right pr-4 select-none w-8">8</div>
          <div className="pl-8">
            <span className="text-[#56b6c2]">'2026-04-01'</span> <span className="text-[#c678dd]">AND</span>{' '}
            <span className="text-[#56b6c2]">'2026-04-30'</span>
          </div>
        </div>
        <div className="flex">
          <div className="text-body text-right pr-4 select-none w-8">9</div>
          <div>
            <span className="text-[#c678dd]">AND</span> <span className="text-[#98c379]">EXISTS</span>{' '}
            <span className="text-body">(</span>
          </div>
        </div>
        <div className="flex">
          <div className="text-body text-right pr-4 select-none w-8">10</div>
          <div className="pl-8">
            <span className="text-[#c678dd]">SELECT</span> <span className="text-[#56b6c2]">1</span>{' '}
            <span className="text-[#c678dd]">FROM</span> <span className="text-[#e5c07b]">subscriptions</span>{' '}
            <span className="text-[#e5c07b]">s</span>
          </div>
        </div>
        <div className="flex">
          <div className="text-body text-right pr-4 select-none w-8">11</div>
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
          <div className="text-body text-right pr-4 select-none w-8">12</div>
          <div className="pl-8">
            <span className="text-[#c678dd]">AND</span> <span className="text-[#e5c07b]">s</span>
            <span className="text-body">.</span>
            <span className="text-[#61afef]">status</span> <span className="text-body">=</span>{' '}
            <span className="text-[#56b6c2]">'active'</span>
          </div>
        </div>
        <div className="flex">
          <div className="text-body text-right pr-4 select-none w-8">13</div>
          <div className="pl-8">
            <span className="text-body">)</span>
          </div>
        </div>
        <div className="flex">
          <div className="text-body text-right pr-4 select-none w-8">14</div>
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
          <div className="text-body text-right pr-4 select-none w-8">15</div>
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
          <div className="text-body text-right pr-4 select-none w-8">16</div>
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
