import type { ReactElement } from 'react';
import type { Route } from '../../core/route';
import { useSite } from '../../core/provider';
import { BOARD_LAYOUTS, isBoardId } from './model/boards';
import { Shell } from './shell/Shell';
import WelcomeScreen from './screens/welcome';
import ChatScreen from './screens/chat';
import AssetsScreen from './screens/assets';
import BoardScreen from './screens/board';
import './styles/tokens.css';
import './styles/shell.css';
import './styles/ui.css';

/**
 * 方案 D · 数据舱：一屏应用。
 *   #/d               欢迎页        screens/welcome
 *   #/d/chat          问答          screens/chat
 *   #/d/assets        资产列表      screens/assets
 *   #/d/board/<id>    看板驾驶舱    screens/board
 * 每个界面是 screens/<name>/index.tsx 的默认导出，接收 { route }；外层统一套 <Shell>。
 * 界面里如需改面包屑或顶栏按钮，可以再套一层 <Shell route crumbs actions>（只覆盖这两项）。
 */
export default function Variant({ route }: { route: Route }) {
  const { data } = useSite();
  const key = `${route.page}:${route.assetId ?? ''}`;

  let crumbs: string[];
  let screen: ReactElement;
  switch (route.page) {
    case 'chat':
      crumbs = ['问答'];
      screen = <ChatScreen key={key} route={route} />;
      break;
    case 'assets':
      crumbs = ['资产'];
      screen = <AssetsScreen key={key} route={route} />;
      break;
    case 'board': {
      const id = route.assetId ?? '';
      const name = isBoardId(id) ? data.assets.find(a => a.id === id)?.name ?? BOARD_LAYOUTS[id].title : '没有找到这个看板';
      crumbs = ['看板', name];
      screen = <BoardScreen key={key} route={route} />;
      break;
    }
    default:
      crumbs = ['欢迎'];
      screen = <WelcomeScreen key={key} route={route} />;
  }
  return <Shell route={route} crumbs={crumbs}>{screen}</Shell>;
}
