import { activePlugins } from "active-plugins";
import HordePluginBase from "plugins/base-plugin";

const DISPLAY_NAME = "Mod template";

/**
 * Место для регистрации плагинов мода.
 * Вызывается до вызова "onFirstRun()" при первом запуске скрипт-машины, а так же при hot-reload.
 */
export function onInitialization() {
    activePlugins.register(new ModTemplatePlugin());
}

/**
 * В этом классе содержится точка входа для выполнения скриптов мода.
 */
class ModTemplatePlugin extends HordePluginBase {
    startTick: number;

    /**
     * Конструктор.
     */
    public constructor() {
        super(DISPLAY_NAME);
        this.startTick = DataStorage.gameTickNum;
    }

    /**
     * Метод вызывается при загрузке сцены и после hot-reload.
     */
    public onFirstRun() {
        // Empty
    }

    /**
     * Метод выполняется каждый игровой такт.
     */
    public onEveryTick(gameTickNum: number) {
        // Empty
    }
}
