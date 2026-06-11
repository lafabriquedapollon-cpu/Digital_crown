import React from 'react';
import { CrownBotChat } from '../../../../components/CrownBot/CrownBotChat';

export function BotView() {
  return (
    // Negative margin to escape parent px-6 padding, giving bot full width
    <div className="-mx-6 h-[calc(100dvh-180px)] flex flex-col overflow-hidden">
      <CrownBotChat />
    </div>
  );
}
