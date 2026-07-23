plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.nsmc.assistant"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.nsmc.assistant"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        ndk {
            abiFilters += listOf("arm64-v8a")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.15"
    }

    sourceSets {
        getByName("main") {
            jniLibs.srcDirs("src/main/jniLibs")
        }
    }
}

tasks.register<Copy>("buildRustLib") {
    dependsOn(":app:preBuild")
    val rustTargetDir = rootProject.projectDir.parentFile?.resolve("backend_rust/target/aarch64-linux-android/release")
    val jniDir = projectDir.resolve("src/main/jniLibs/arm64-v8a")
    doFirst {
        if (rustTargetDir != null && rustTargetDir.exists()) {
            val soFile = rustTargetDir.resolve("libbackend_rust.so")
            if (soFile.exists()) {
                jniDir.mkdirs()
                soFile.copyTo(jniDir.resolve("libbackend_rust.so"), overwrite = true)
            }
        }
    }
}

tasks.whenTaskAdded {
    if (name.startsWith("merge") && name.endsWith("JniLibFolders")) {
        dependsOn("buildRustLib")
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.foundation:foundation")

    implementation("androidx.navigation:navigation-compose:2.8.5")

    implementation("com.google.code.gson:gson:2.11.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
