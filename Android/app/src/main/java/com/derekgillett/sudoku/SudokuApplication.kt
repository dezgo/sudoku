package com.derekgillett.sudoku

import android.app.Application

class SudokuApplication : Application() {
    val container: AppContainer by lazy { AppContainer(applicationContext) }
}
