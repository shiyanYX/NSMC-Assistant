package com.nsmc.assistant.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.core.view.WindowCompat

val ClinicalBlue = Color(0xFF3A86FF)
val ClinicalBlueDark = Color(0xFF6BA3FF)
val ClinicalBg = Color(0xFFF8F9FA)
val ClinicalSurface = Color(0xFFFFFFFF)
val ClinicalFg = Color(0xFF1A1A2E)
val ClinicalMuted = Color(0xFF6C757D)

val SuccessGreen = Color(0xFF2D9F4E)
val ErrorRed = Color(0xFFDC3545)
val WarningOrange = Color(0xFFE67E22)

private val LightColorScheme = lightColorScheme(
    primary = ClinicalBlue,
    onPrimary = Color.White,
    background = ClinicalBg,
    surface = ClinicalSurface,
    onBackground = ClinicalFg,
    onSurface = ClinicalFg,
    outline = Color(0xFFDEE2E6),
    error = ErrorRed,
)

private val DarkColorScheme = darkColorScheme(
    primary = ClinicalBlueDark,
    onPrimary = Color.Black,
    background = Color(0xFF121212),
    surface = Color(0xFF1E1E1E),
    onBackground = Color(0xFFE0E0E0),
    onSurface = Color(0xFFE0E0E0),
    outline = Color(0xFF333333),
    error = Color(0xFFEF5350),
)

@Composable
fun NSMCAssistantTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val view = androidx.compose.ui.platform.LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }
    MaterialTheme(
        colorScheme = colorScheme,
        content = content,
    )
}
