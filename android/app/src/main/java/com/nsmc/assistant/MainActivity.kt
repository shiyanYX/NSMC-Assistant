package com.nsmc.assistant

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.nsmc.assistant.ui.screens.HomeScreen
import com.nsmc.assistant.ui.screens.LoginScreen
import com.nsmc.assistant.ui.theme.NSMCAssistantTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            NSMCAssistantTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    var isLoggedIn by remember { mutableStateOf(false) }
                    var currentUser by remember { mutableStateOf<LoginState?>(null) }

                    if (isLoggedIn && currentUser != null) {
                        HomeScreen(
                            loginState = currentUser!!,
                            onLogout = {
                                currentUser = null
                                isLoggedIn = false
                            }
                        )
                    } else {
                        LoginScreen(
                            onLoginSuccess = { state ->
                                currentUser = state
                                isLoggedIn = true
                            }
                        )
                    }
                }
            }
        }
    }
}
