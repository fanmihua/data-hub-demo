import { NumberRoller } from '../../../core/ui/NumberRoller';

/**
 * 数黑体大数 + 数字滚轮（参考 C 版大数）。
 * - format 只负责数字部分，例如 wan、pctNumber；单位单独传，缩到数字的 50%，基线对齐，间距 3px；
 * - size：md 28px（卡片）/ lg 44px（指标行）/ xl 72px（主视觉）；
 * - 读屏读「label 数值 单位」，滚轮本身 aria-hidden。
 */
export function BigNumber({ value, format, unit, label, size = 'lg' }: {
  value: number;
  format: (n: number) => string;
  unit?: string;
  label?: string;
  size?: 'md' | 'lg' | 'xl';
}) {
  const text = format(value);
  return (
    <div className={`vd-big is-${size}`}>
      {label && <span className="vd-big-label">{label}</span>}
      <span className="vd-big-value">
        <NumberRoller value={value} format={format} className="vd-big-num" duration={size === 'xl' ? 1300 : 1000} label={`${label ? `${label} ` : ''}${text}${unit ? `${unit === '%' ? '' : ' '}${unit}` : ''}`} />
        {unit && <span className="vd-big-unit" aria-hidden="true">{unit}</span>}
      </span>
    </div>
  );
}
