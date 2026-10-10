// luwi-plugins 这一份的 Gradle 根 —— 与 Luwi 本体那份只有"收哪几个模块"不同:
// 这里没有 :app, 只有插件层那三样 (接口 + 两份样例伴侣)
pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
plugins {
    // JDK 25 由 gradle/gradle-daemon-jvm.properties 挑, 本机没有时它按那里面的 foojay 链接自己下
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "luwi-plugins"

// 对外接口那一份 (手写 Binder 的两个接口 + 常量): 主应用与第三方伴侣都引它,
// 发出去的 `lwplugin-api-1.jar` 就是它的 classes.jar (协议第 9 节)
include(":lwplugin-api")
// 样例伴侣 (协议 P1 的那一份): 它不在主应用的打包路径上, 单独 build
include(":sample-companion")
project(":sample-companion").projectDir = file("samples/companion")
// 鲸鱼娘桌面小组件那一份伴侣: 协议 10.4 说"桌面组件只能由伴侣 APK 声明", 这就是走那条路
include(":sample-whale-widget")
project(":sample-whale-widget").projectDir = file("samples/whale-widget")
