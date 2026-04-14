// picocolors: Transitive dependency from Vite.
import pc from 'picocolors';

export function warnLog(msg: string): void {
    // Use yellow for warnings
    console.warn(pc.yellow(`\n${msg}`));
}

export function debugLog(msg: string): void {
    // Use blue for debug
    console.debug(pc.blue(`\n${msg}`));
}
