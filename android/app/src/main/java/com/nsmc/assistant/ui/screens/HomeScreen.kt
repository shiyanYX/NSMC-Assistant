package com.nsmc.assistant.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nsmc.assistant.LoginState

enum class NavTab(val label: String) {
    Score("成绩"),
    Evaluation("评教"),
    Leave("去向");
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(loginState: LoginState, onLogout: () -> Unit) {
    var tab by remember { mutableStateOf(NavTab.Score) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("川北医助手", fontWeight = FontWeight.SemiBold) },
                actions = {
                    Text(loginState.name, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(4.dp))
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Outlined.ExitToApp, contentDescription = "退出")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavTab.entries.forEach { t ->
                    NavigationBarItem(
                        icon = {
                            when (t) {
                                NavTab.Score -> Icon(Icons.Outlined.Grading, contentDescription = "成绩")
                                NavTab.Evaluation -> Icon(Icons.Outlined.RateReview, contentDescription = "评教")
                                NavTab.Leave -> Icon(Icons.Outlined.Place, contentDescription = "去向")
                            }
                        },
                        label = { Text(t.label, fontSize = 12.sp) },
                        selected = tab == t,
                        onClick = { tab = t }
                    )
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (tab) {
                NavTab.Score -> ScoreScreen(loginState)
                NavTab.Evaluation -> EvaluationScreen(loginState)
                NavTab.Leave -> LeaveRegistrationScreen(loginState)
            }
        }
    }
}
